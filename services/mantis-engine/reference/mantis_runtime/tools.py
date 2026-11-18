"""Tools the model can call: plain Python functions and the structured-answer tool."""

from __future__ import annotations

import inspect
import json
import types as pytypes
import typing
from typing import Any, Callable, Optional, get_args, get_origin

from pydantic import BaseModel, TypeAdapter, ValidationError, create_model

from . import types

SET_MODEL_RESPONSE_TOOL_NAME = "set_model_response"


class ToolContext:
    """What a tool sees of its invocation: state, actions, the call id."""

    def __init__(self, invocation_context: Any = None, function_call_id: Optional[str] = None,
                 event_actions: Any = None):
        from .events import EventActions

        self._invocation_context = invocation_context
        self.function_call_id = function_call_id
        self.actions = event_actions if event_actions is not None else EventActions()

    @property
    def invocation_context(self) -> Any:
        return self._invocation_context

    @property
    def agent_name(self) -> str:
        agent = getattr(self._invocation_context, "agent", None)
        return getattr(agent, "name", "") or ""

    @property
    def invocation_id(self) -> str:
        return getattr(self._invocation_context, "invocation_id", "") or ""

    @property
    def session(self) -> Any:
        return getattr(self._invocation_context, "session", None)

    @property
    def state(self) -> "DeltaState":
        from .agents import DeltaState

        session = self.session
        base = session.state if session is not None else {}
        return DeltaState(base, self.actions.state_delta)


class BaseTool:
    """A callable the model can be offered."""

    def __init__(self, name: str, description: str = "", is_long_running: bool = False):
        self.name = name
        self.description = description
        self.is_long_running = is_long_running

    def _get_declaration(self) -> Optional[types.FunctionDeclaration]:
        return None

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        raise NotImplementedError(f"Tool {self.name!r} cannot be run")

    async def process_llm_request(self, *, tool_context: ToolContext, llm_request: Any) -> None:
        llm_request.append_tools([self])


_SKIP_PARAMS = {"tool_context", "self", "cls", "callback_context", "input_stream"}


def _strip_titles(schema: Any) -> Any:
    if isinstance(schema, dict):
        return {k: _strip_titles(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [_strip_titles(v) for v in schema]
    return schema


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Resolves local ``$ref``s so every provider sees a self-contained schema."""
    defs = schema.pop("$defs", None) or schema.pop("definitions", None) or {}

    def walk(node: Any, seen: tuple[str, ...] = ()) -> Any:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/"):
                name = ref.rsplit("/", 1)[-1]
                if name in defs and name not in seen:
                    merged = {**walk(defs[name], seen + (name,)), **{k: v for k, v in node.items() if k != "$ref"}}
                    return merged
                return {"type": "object"}
            return {k: walk(v, seen) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v, seen) for v in node]
        return node

    return walk(schema)


def parameters_schema_for(func: Callable[..., Any], ignore: set[str] | None = None) -> dict[str, Any]:
    """JSON schema of a function's parameters, built with pydantic."""
    ignore = set(ignore or ()) | _SKIP_PARAMS
    sig = inspect.signature(func)
    try:
        hints = typing.get_type_hints(func)
    except Exception:
        hints = {}
    fields: dict[str, Any] = {}
    for name, param in sig.parameters.items():
        if name in ignore or param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            continue
        ann = hints.get(name, param.annotation)
        if ann is inspect.Parameter.empty:
            ann = Any
        default = ... if param.default is inspect.Parameter.empty else param.default
        fields[name] = (ann, default)
    if not fields:
        return {"type": "object", "properties": {}}
    try:
        model = create_model(f"{getattr(func, '__name__', 'tool')}_params", **fields)  # type: ignore[call-overload]
        schema = model.model_json_schema()
    except Exception:
        schema = {
            "type": "object",
            "properties": {n: {} for n in fields},
            "required": [n for n, (_a, d) in fields.items() if d is ...],
        }
    schema = _strip_titles(_inline_refs(schema))
    schema.setdefault("type", "object")
    schema.setdefault("properties", {})
    return schema


class FunctionTool(BaseTool):
    """Wraps a Python function (sync or async) as a tool."""

    def __init__(self, func: Callable[..., Any], *, require_confirmation: Any = None):
        name = getattr(func, "name", None) or getattr(func, "__name__", None) or type(func).__name__
        doc = inspect.cleandoc(func.__doc__) if getattr(func, "__doc__", None) else ""
        super().__init__(name=name, description=doc)
        self.func = func

    def _get_declaration(self) -> Optional[types.FunctionDeclaration]:
        return types.FunctionDeclaration(
            name=self.name,
            description=self.description,
            parameters_json_schema=parameters_schema_for(self.func),
        )

    def _accepts(self) -> tuple[set[str], bool, list[str]]:
        sig = inspect.signature(self.func)
        params = sig.parameters
        accepts_kwargs = any(p.kind == p.VAR_KEYWORD for p in params.values())
        mandatory = [
            n for n, p in params.items()
            if n not in _SKIP_PARAMS
            and p.default is inspect.Parameter.empty
            and p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)
        ]
        return set(params), accepts_kwargs, mandatory

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        names, accepts_kwargs, mandatory = self._accepts()
        call_args = dict(args or {}) if accepts_kwargs else {k: v for k, v in (args or {}).items() if k in names}
        if "tool_context" in names:
            call_args["tool_context"] = tool_context
        missing = [m for m in mandatory if m not in call_args]
        if missing:
            listed = "\n".join(missing)
            return {
                "error": (
                    f"Invoking `{self.name}()` failed as the following mandatory input "
                    f"parameters are not present:\n{listed}\nYou could retry calling this "
                    "tool, but it is IMPORTANT for you to provide all the mandatory parameters."
                )
            }
        result = self.func(**call_args)
        if inspect.isawaitable(result):
            result = await result
        return result


def _list_inner_model(schema: Any) -> Optional[type[BaseModel]]:
    if get_origin(schema) is list:
        args = get_args(schema)
        if args and isinstance(args[0], type) and issubclass(args[0], BaseModel):
            return args[0]
    return None


def _is_model(schema: Any) -> bool:
    return isinstance(schema, type) and issubclass(schema, BaseModel)


class SetModelResponseTool(BaseTool):
    """The tool a model calls to deliver its final structured answer."""

    NAME = SET_MODEL_RESPONSE_TOOL_NAME

    def __init__(self, output_schema: Any):
        super().__init__(
            name=self.NAME,
            description=(
                "Set your final response using the required output schema.\n\n"
                "Use this tool to provide your final structured answer instead\n"
                "of outputting text directly."
            ),
        )
        self.output_schema = output_schema
        self._model_type = output_schema if _is_model(output_schema) else None
        self._list_model_type = _list_inner_model(output_schema)

    def _parameters(self) -> dict[str, Any]:
        if self._model_type is not None:
            schema = self._model_type.model_json_schema()
        elif self._list_model_type is not None:
            schema = {
                "type": "object",
                "properties": {"items": TypeAdapter(self.output_schema).json_schema()},
                "required": ["items"],
            }
        elif isinstance(self.output_schema, dict):
            schema = {"type": "object", "properties": {"response": {"type": "object"}}, "required": ["response"]}
        else:
            schema = {
                "type": "object",
                "properties": {"response": TypeAdapter(self.output_schema).json_schema()},
                "required": ["response"],
            }
        return _strip_titles(_inline_refs(schema))

    def _get_declaration(self) -> Optional[types.FunctionDeclaration]:
        return types.FunctionDeclaration(
            name=self.name, description=self.description, parameters_json_schema=self._parameters()
        )

    async def run_async(self, *, args: dict[str, Any], tool_context: ToolContext) -> Any:
        try:
            if self._model_type is not None:
                result: Any = self._model_type.model_validate(args or {}).model_dump(exclude_none=True)
            elif self._list_model_type is not None:
                items = TypeAdapter(self.output_schema).validate_python((args or {}).get("items", []))
                result = [i.model_dump(exclude_none=True) for i in items]
            else:
                result = (args or {}).get("response")
        except ValidationError as e:
            return {
                "error": (
                    f"Validation Error found:\n{e}\nRecall the set_model_response function "
                    "correctly, fix the errors, and call it again with all required fields "
                    "using the correct types."
                )
            }
        tool_context.actions.set_model_response = result
        return result


def validate_schema(schema: Any, json_text: str) -> Any:
    """Validates a model's final text against an output schema."""
    text = json_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
        text = text.strip()
    if _is_model(schema):
        return schema.model_validate_json(text).model_dump(exclude_none=True)
    inner = _list_inner_model(schema)
    if inner is not None:
        return [i.model_dump(exclude_none=True) for i in TypeAdapter(schema).validate_json(text)]
    return TypeAdapter(schema).validate_json(text) if not isinstance(schema, dict) else json.loads(text)


def as_tool(obj: Any) -> BaseTool:
    if isinstance(obj, BaseTool):
        return obj
    if callable(obj):
        return FunctionTool(obj)
    raise TypeError(f"Cannot use {obj!r} as a tool")


__all__ = [
    "BaseTool",
    "FunctionTool",
    "SET_MODEL_RESPONSE_TOOL_NAME",
    "SetModelResponseTool",
    "ToolContext",
    "as_tool",
    "parameters_schema_for",
    "validate_schema",
]

_ = pytypes  # keep import for typing helpers on some Python versions
