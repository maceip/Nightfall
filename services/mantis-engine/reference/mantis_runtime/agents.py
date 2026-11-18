"""The LLM agent: instruction + model + tools, run as a tool-calling loop."""

from __future__ import annotations

import asyncio
import copy
import enum
import inspect
import json
import logging
import uuid
from typing import Any, AsyncGenerator, Callable, Optional, Union

from . import types
from .events import Event, EventActions, to_content
from .models import BaseLlm, LlmRequest, LlmResponse, has_meaningful_content
from .tools import BaseTool, SetModelResponseTool, ToolContext, as_tool, validate_schema

logger = logging.getLogger("mantis_runtime.agents")

NO_CONTENT_ERROR_CODE = "MODEL_RETURNED_NO_CONTENT"
NO_CONTENT_ERROR_MESSAGE = "The model returned no content (finish_reason=STOP with empty parts)."
NO_MEANINGFUL_CONTENT_ERROR_MESSAGE = (
    "The model returned no actionable content (finish_reason=STOP with thought-only or whitespace-only parts)."
)
CLIENT_FUNCTION_CALL_ID_PREFIX = "adk-"
SET_MODEL_RESPONSE_INSTRUCTION = (
    "IMPORTANT: You have access to other tools, but you must provide your final response using the "
    "set_model_response tool with the required structured format. After using any other tools needed "
    "to complete the task, always call set_model_response with your final answer in the specified "
    "schema format."
)


class StreamingMode(str, enum.Enum):
    NONE = "none"
    SSE = "sse"
    BIDI = "bidi"


class LlmCallsLimitExceededError(Exception):
    """The run made more model calls than RunConfig.max_llm_calls allows."""


class RunConfig:
    def __init__(self, *, max_llm_calls: int = 500, streaming_mode: StreamingMode = StreamingMode.NONE, **kwargs: Any):
        self.max_llm_calls = max_llm_calls
        self.streaming_mode = streaming_mode
        for k, v in kwargs.items():
            setattr(self, k, v)


class ContextCacheConfig:
    """Request provider-side prompt caching (honoured by the model adapter)."""

    def __init__(self, cache_intervals: int = 10, ttl_seconds: int = 1800, min_tokens: int = 0, **kwargs: Any):
        self.cache_intervals = cache_intervals
        self.ttl_seconds = ttl_seconds
        self.min_tokens = min_tokens
        for k, v in kwargs.items():
            setattr(self, k, v)


class DeltaState:
    """Session state view whose writes are also recorded as a delta."""

    def __init__(self, value: dict[str, Any], delta: dict[str, Any]):
        self._value = value if value is not None else {}
        self._delta = delta

    def __getitem__(self, key: str) -> Any:
        if key in self._delta:
            return self._delta[key]
        return self._value[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self._value[key] = value
        self._delta[key] = value

    def __contains__(self, key: object) -> bool:
        return key in self._delta or key in self._value

    def __delitem__(self, key: str) -> None:
        self._delta.pop(key, None)
        self._value.pop(key, None)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def setdefault(self, key: str, default: Any = None) -> Any:
        if key in self:
            return self[key]
        self[key] = default
        return default

    def update(self, other: dict[str, Any] | None = None, **kwargs: Any) -> None:
        for k, v in {**(other or {}), **kwargs}.items():
            self[k] = v

    def has_delta(self) -> bool:
        return bool(self._delta)

    def to_dict(self) -> dict[str, Any]:
        return {**self._value, **self._delta}

    def keys(self):
        return self.to_dict().keys()

    def items(self):
        return self.to_dict().items()

    def values(self):
        return self.to_dict().values()

    def __iter__(self):
        return iter(self.to_dict())

    def __len__(self) -> int:
        return len(self.to_dict())

    def __repr__(self) -> str:
        return f"DeltaState({self.to_dict()!r})"


class InvocationContext:
    """Everything one invocation of the runner carries."""

    def __init__(
        self,
        *,
        invocation_id: str,
        session: Any,
        agent: Any = None,
        run_config: Optional[RunConfig] = None,
        session_service: Any = None,
        user_content: Optional[types.Content] = None,
        branch: Optional[str] = None,
        node_path: str = "",
        emit: Optional[Callable[[Event], Any]] = None,
        app: Any = None,
        counter: Optional[dict[str, int]] = None,
    ):
        self.invocation_id = invocation_id
        self.session = session
        self.agent = agent
        self.run_config = run_config or RunConfig()
        self.session_service = session_service
        self.user_content = user_content
        self.branch = branch
        self.node_path = node_path
        self.end_invocation = False
        self.is_aborted = False
        self._emit = emit
        self.app = app
        self._llm_calls = counter if counter is not None else {"n": 0}

    @property
    def app_name(self) -> str:
        return getattr(self.session, "app_name", "") or ""

    @property
    def user_id(self) -> str:
        return getattr(self.session, "user_id", "") or ""

    def increment_llm_call_count(self) -> None:
        self._llm_calls["n"] += 1
        limit = getattr(self.run_config, "max_llm_calls", 0) or 0
        if limit > 0 and self._llm_calls["n"] > limit:
            raise LlmCallsLimitExceededError(f"Max number of llm calls limit of `{limit}` exceeded")

    def model_copy(self, update: Optional[dict[str, Any]] = None) -> "InvocationContext":
        clone = copy.copy(self)
        for k, v in (update or {}).items():
            setattr(clone, k, v)
        return clone

    async def emit(self, event: Event) -> None:
        if self._emit is None:
            return
        result = self._emit(event)
        if inspect.isawaitable(result):
            await result


class CallbackContext:
    """What a callback sees: state (with delta tracking), actions, the session."""

    def __init__(self, invocation_context: InvocationContext, event_actions: Optional[EventActions] = None):
        self._invocation_context = invocation_context
        self._event_actions = event_actions if event_actions is not None else EventActions()
        session = invocation_context.session
        self._state = DeltaState(getattr(session, "state", {}) if session is not None else {},
                                 self._event_actions.state_delta)

    @property
    def state(self) -> DeltaState:
        return self._state

    @property
    def actions(self) -> EventActions:
        return self._event_actions

    @property
    def agent_name(self) -> str:
        return getattr(self._invocation_context.agent, "name", "") or ""

    @property
    def invocation_id(self) -> str:
        return self._invocation_context.invocation_id

    @property
    def session(self) -> Any:
        return self._invocation_context.session

    @property
    def user_content(self) -> Optional[types.Content]:
        return self._invocation_context.user_content

    @property
    def run_config(self) -> RunConfig:
        return self._invocation_context.run_config

    @property
    def node_path(self) -> str:
        return self._invocation_context.node_path

    def get_invocation_context(self) -> InvocationContext:
        return self._invocation_context


ReadonlyContext = CallbackContext


def _as_list(cb: Any) -> list[Callable[..., Any]]:
    if cb is None:
        return []
    if isinstance(cb, (list, tuple)):
        return [c for c in cb if c is not None]
    return [cb]


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def _run_callbacks(callbacks: list[Callable[..., Any]], stop: Callable[[Any], bool], **kwargs: Any) -> Any:
    for cb in callbacks:
        result = await _maybe_await(cb(**kwargs))
        if stop(result):
            return result
    return None


def _truthy(v: Any) -> bool:
    return bool(v)


def _not_none(v: Any) -> bool:
    return v is not None


def _resolve_model(model: Any) -> BaseLlm:
    if isinstance(model, BaseLlm):
        return model
    if isinstance(model, str) and model:
        from .lite_llm import LiteLlm

        return LiteLlm(model=model)
    if model is not None and hasattr(model, "generate_content_async"):
        return model
    raise ValueError("No model configured for agent")


class BaseAgent:
    """Common agent fields and callback plumbing."""

    def __init__(
        self,
        *,
        name: str,
        description: str = "",
        before_agent_callback: Any = None,
        after_agent_callback: Any = None,
        sub_agents: Optional[list[Any]] = None,
        **extra: Any,
    ):
        self.name = name
        self.description = description
        self.before_agent_callback = before_agent_callback
        self.after_agent_callback = after_agent_callback
        self.sub_agents = list(sub_agents or [])
        self.parent_agent = None
        for k, v in extra.items():
            setattr(self, k, v)

    @property
    def root_agent(self) -> "BaseAgent":
        node = self
        while getattr(node, "parent_agent", None) is not None:
            node = node.parent_agent
        return node

    def find_agent(self, name: str) -> Optional["BaseAgent"]:
        if self.name == name:
            return self
        for sub in self.sub_agents:
            found = sub.find_agent(name) if hasattr(sub, "find_agent") else None
            if found is not None:
                return found
        return None

    def model_copy(self, update: Optional[dict[str, Any]] = None, deep: bool = False) -> "BaseAgent":
        clone = copy.deepcopy(self) if deep else copy.copy(self)
        for k, v in (update or {}).items():
            setattr(clone, k, v)
        return clone

    @property
    def canonical_before_agent_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.before_agent_callback)

    @property
    def canonical_after_agent_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.after_agent_callback)

    def _event(self, ic: InvocationContext, **kwargs: Any) -> Event:
        ev = Event(invocation_id=ic.invocation_id, author=self.name, branch=ic.branch, **kwargs)
        if ic.node_path:
            ev.node_info.path = ic.node_path
        return ev

    async def run_async(self, ic: InvocationContext) -> AsyncGenerator[Event, None]:
        ic = ic.model_copy(update={"agent": self})
        cc = CallbackContext(ic)
        content = await _run_callbacks(self.canonical_before_agent_callbacks, _truthy, callback_context=cc)
        if content is not None or cc.state.has_delta():
            ev = self._event(ic, actions=cc.actions)
            if content is not None:
                ev.content = to_content(content, role="model")
                self._attach_output(ic, ev)
            yield ev
            if content is not None:
                return
        async for ev in self._run_async_impl(ic):
            yield ev
        cc = CallbackContext(ic)
        content = await _run_callbacks(self.canonical_after_agent_callbacks, _truthy, callback_context=cc)
        if content is not None or cc.state.has_delta():
            ev = self._event(ic, actions=cc.actions)
            if content is not None:
                ev.content = to_content(content, role="model")
                self._attach_output(ic, ev)
            yield ev

    async def _run_async_impl(self, ic: InvocationContext) -> AsyncGenerator[Event, None]:
        raise NotImplementedError
        yield  # pragma: no cover

    def _attach_output(self, ic: InvocationContext, ev: Event) -> None:
        return None


InstructionProvider = Callable[[Any], Union[str, Any]]


class LlmAgent(BaseAgent):
    """An agent that calls a model in a loop until it gives a final answer."""

    def __init__(
        self,
        *,
        name: str,
        model: Any = "",
        instruction: Union[str, InstructionProvider] = "",
        global_instruction: Union[str, InstructionProvider] = "",
        tools: Optional[list[Any]] = None,
        output_schema: Any = None,
        output_key: Optional[str] = None,
        include_contents: str = "default",
        generate_content_config: Optional[types.GenerateContentConfig] = None,
        before_model_callback: Any = None,
        after_model_callback: Any = None,
        on_model_error_callback: Any = None,
        before_tool_callback: Any = None,
        after_tool_callback: Any = None,
        on_tool_error_callback: Any = None,
        mode: Optional[str] = None,
        **kwargs: Any,
    ):
        super().__init__(name=name, **kwargs)
        self.model = model
        self.instruction = instruction
        self.global_instruction = global_instruction
        self.tools = list(tools or [])
        self.output_schema = output_schema
        self.output_key = output_key
        self.include_contents = include_contents
        self.generate_content_config = generate_content_config
        self.before_model_callback = before_model_callback
        self.after_model_callback = after_model_callback
        self.on_model_error_callback = on_model_error_callback
        self.before_tool_callback = before_tool_callback
        self.after_tool_callback = after_tool_callback
        self.on_tool_error_callback = on_tool_error_callback
        self.mode = mode

    # -- canonical accessors -------------------------------------------------

    @property
    def canonical_model(self) -> BaseLlm:
        model = self.model
        if not model and self.parent_agent is not None and hasattr(self.parent_agent, "canonical_model"):
            return self.parent_agent.canonical_model
        return _resolve_model(model)

    @property
    def canonical_tools_list(self) -> list[BaseTool]:
        return [as_tool(t) for t in self.tools]

    async def canonical_tools(self, ctx: Any = None) -> list[BaseTool]:
        return self.canonical_tools_list

    @property
    def canonical_before_model_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.before_model_callback)

    @property
    def canonical_after_model_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.after_model_callback)

    @property
    def canonical_on_model_error_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.on_model_error_callback)

    @property
    def canonical_before_tool_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.before_tool_callback)

    @property
    def canonical_after_tool_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.after_tool_callback)

    @property
    def canonical_on_tool_error_callbacks(self) -> list[Callable[..., Any]]:
        return _as_list(self.on_tool_error_callback)

    async def canonical_instruction(self, ctx: Any) -> tuple[str, bool]:
        """The instruction text, and whether it came from a provider callable.

        Instructions are never templated, so the text is used verbatim either way.
        """
        instr = self.instruction
        if callable(instr) and not isinstance(instr, str):
            return str(await _maybe_await(instr(ctx)) or ""), True
        return str(instr or ""), False

    # -- request building ----------------------------------------------------

    async def _build_request(self, ic: InvocationContext) -> LlmRequest:
        model = self.canonical_model
        cfg = (
            self.generate_content_config.model_copy(deep=True)
            if self.generate_content_config is not None
            else types.GenerateContentConfig()
        )
        req = LlmRequest(model=getattr(model, "model", None) or None, config=cfg)
        ro = CallbackContext(ic)
        if self.global_instruction:
            gi = self.global_instruction
            if callable(gi) and not isinstance(gi, str):
                gi = await _maybe_await(gi(ro))
            if gi:
                req.append_instructions([str(gi)])
        instruction, _ = await self.canonical_instruction(ro)
        if instruction:
            req.append_instructions([instruction])
        tools = self.canonical_tools_list
        for tool in tools:
            tc = ToolContext(ic)
            await tool.process_llm_request(tool_context=tc, llm_request=req)
        if self.output_schema is not None:
            caps = getattr(model, "capabilities", None)
            both = bool(getattr(caps, "output_schema_and_tools", False))
            if tools and not both:
                req.append_tools([SetModelResponseTool(self.output_schema)])
                req.append_instructions([SET_MODEL_RESPONSE_INSTRUCTION])
            else:
                req.set_output_schema(self.output_schema)
        req.contents = build_contents(self, ic)
        if getattr(ic.app, "context_cache_config", None) is not None:
            req.cache_config = ic.app.context_cache_config
        return req

    # -- the loop --------------------------------------------------------------

    async def _run_async_impl(self, ic: InvocationContext) -> AsyncGenerator[Event, None]:
        while True:
            if ic.is_aborted:
                return
            last: Optional[Event] = None
            async for ev in self._run_one_step(ic):
                last = ev
                yield ev
                if ic.is_aborted:
                    return
            if ic.end_invocation:
                return
            if last is None or last.is_final_response() or last.partial:
                return

    async def _run_one_step(self, ic: InvocationContext) -> AsyncGenerator[Event, None]:
        req = await self._build_request(ic)
        model_event = self._event(ic)
        streaming = getattr(ic.run_config, "streaming_mode", StreamingMode.NONE) == StreamingMode.SSE

        async for resp in self._call_llm(ic, req, model_event, streaming):
            if not resp.partial and resp.error_code is None and resp.finish_reason in (types.FinishReason.STOP, "STOP"):
                if not has_meaningful_content(resp) and not streaming:
                    has_parts = bool(resp.content and resp.content.parts)
                    resp.error_code = NO_CONTENT_ERROR_CODE
                    resp.error_message = resp.error_message or (
                        NO_MEANINGFUL_CONTENT_ERROR_MESSAGE if has_parts else NO_CONTENT_ERROR_MESSAGE
                    )
            if not resp.content and not resp.error_code and not resp.interrupted:
                continue
            ev = self._finalize_event(model_event, resp)
            if not ev.partial:
                model_event = self._event(ic, actions=EventActions())
            if not ev.partial and not ev.get_function_calls():
                self._attach_output(ic, ev)
            yield ev
            if ev.get_function_calls() and not ev.partial:
                fr_event = await self._handle_function_calls(ic, ev, req)
                if fr_event is not None:
                    yield fr_event
                    structured = fr_event.actions.set_model_response
                    if structured is not None and any(
                        fr.name == SetModelResponseTool.NAME for fr in fr_event.get_function_responses()
                    ):
                        final = self._event(ic)
                        final.content = types.Content(
                            role="model", parts=[types.Part(text=json.dumps(structured, ensure_ascii=False))]
                        )
                        self._attach_output(ic, final)
                        yield final

    def _finalize_event(self, model_event: Event, resp: LlmResponse) -> Event:
        updates = {
            name: getattr(resp, name)
            for name in LlmResponse.model_fields
            if getattr(resp, name, None) is not None
        }
        ev = model_event.model_copy(update=updates)
        if ev.content is not None and not ev.content.role:
            ev.content = ev.content.model_copy(update={"role": "model"})
        if not ev.partial:
            for fc in ev.get_function_calls():
                if not fc.id:
                    fc.id = CLIENT_FUNCTION_CALL_ID_PREFIX + str(uuid.uuid4())
        return ev

    def _attach_output(self, ic: InvocationContext, ev: Event) -> None:
        if not ev.content or ev.content.role != "model" or ev.partial or ev.error_code:
            return
        text = types.content_text(ev.content)
        if self.output_schema is not None:
            if not text.strip():
                return
            try:
                output = validate_schema(self.output_schema, text)
            except Exception:
                logger.warning("Agent %s: final text did not match its output schema", self.name)
                return
        else:
            if not text and not ev.content.parts:
                return
            output = text
            ev.node_info.message_as_output = True
        ev.output = output
        if self.output_key and output is not None:
            ev.actions.state_delta[self.output_key] = output

    async def _call_llm(
        self, ic: InvocationContext, req: LlmRequest, model_event: Event, streaming: bool
    ) -> AsyncGenerator[LlmResponse, None]:
        cc = CallbackContext(ic, event_actions=model_event.actions)
        override = await _run_callbacks(
            self.canonical_before_model_callbacks, _truthy, callback_context=cc, llm_request=req
        )
        if override:
            yield override
            return
        req.config.labels = dict(req.config.labels or {})
        req.config.labels.setdefault("adk_agent_name", self.name)
        llm = self.canonical_model
        ic.increment_llm_call_count()
        try:
            async for resp in llm.generate_content_async(req, stream=streaming):
                cc = CallbackContext(ic, event_actions=model_event.actions)
                altered = await _run_callbacks(
                    self.canonical_after_model_callbacks, _truthy, callback_context=cc, llm_response=resp
                )
                if altered:
                    if isinstance(altered, LlmResponse):
                        if altered.partial is None and resp.partial is not None:
                            altered.partial = resp.partial
                        if altered.usage_metadata is None and resp.usage_metadata is not None:
                            altered.usage_metadata = resp.usage_metadata
                    resp = altered
                yield resp
        except (asyncio.CancelledError, GeneratorExit):
            raise
        except Exception as err:
            cc = CallbackContext(ic, event_actions=model_event.actions)
            replacement = await _run_callbacks(
                self.canonical_on_model_error_callbacks, _not_none, callback_context=cc, llm_request=req, error=err
            )
            if replacement is None:
                raise
            yield replacement

    async def _handle_function_calls(self, ic: InvocationContext, call_event: Event, req: LlmRequest) -> Optional[Event]:
        calls = call_event.get_function_calls()
        if not calls:
            return None
        results = await asyncio.gather(*(self._run_one_tool(ic, fc, req.tools_dict) for fc in calls))
        parts: list[types.Part] = []
        merged = EventActions()
        for part, actions in results:
            parts.append(part)
            merged.state_delta.update(actions.state_delta)
            for k, v in (actions.model_extra or {}).items():
                setattr(merged, k, v)
            for field in ("escalate", "skip_summarization", "transfer_to_agent", "route"):
                if getattr(actions, field, None):
                    setattr(merged, field, getattr(actions, field))
            if actions.set_model_response is not None:
                merged.set_model_response = actions.set_model_response
        ev = self._event(ic, content=types.Content(role="user", parts=parts), actions=merged)
        return ev

    async def _run_one_tool(
        self, ic: InvocationContext, fc: types.FunctionCall, tools_dict: dict[str, BaseTool]
    ) -> tuple[types.Part, EventActions]:
        args = copy.deepcopy(fc.args) if fc.args else {}
        tc = ToolContext(ic, function_call_id=fc.id)
        tool = tools_dict.get(fc.name or "")
        lookup_error: Optional[Exception] = None
        if tool is None:
            lookup_error = ValueError(
                f"Tool '{fc.name}' not found.\nAvailable tools: {', '.join(tools_dict)}"
            )
            tool = BaseTool(name=fc.name or "<unnamed>", description="Tool not found")

        response = await _run_callbacks(
            self.canonical_before_tool_callbacks, _not_none, tool=tool, args=args, tool_context=tc
        )
        if response is None and lookup_error is not None:
            response = await _run_callbacks(
                self.canonical_on_tool_error_callbacks, _not_none,
                tool=tool, args=args, tool_context=tc, error=lookup_error,
            )
            if response is None:
                response = {"error": str(lookup_error)}
        elif response is None:
            try:
                response = await tool.run_async(args=args, tool_context=tc)
            except (asyncio.CancelledError, GeneratorExit):
                raise
            except Exception as err:
                response = await _run_callbacks(
                    self.canonical_on_tool_error_callbacks, _not_none,
                    tool=tool, args=args, tool_context=tc, error=err,
                )
                if response is None:
                    raise
        altered = await _run_callbacks(
            self.canonical_after_tool_callbacks, _not_none,
            tool=tool, args=args, tool_context=tc, tool_response=response,
        )
        if altered is not None:
            response = altered
        if isinstance(response, types.FunctionResponse):
            response = response.response
        if not isinstance(response, dict):
            response = {"result": response}
        response = _unwrap_enums(response)
        part = types.Part(function_response=types.FunctionResponse(id=fc.id, name=tool.name, response=response))
        return part, tc.actions


def _unwrap_enums(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {(k.value if isinstance(k, enum.Enum) else k): _unwrap_enums(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_unwrap_enums(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_unwrap_enums(v) for v in value)
    return value


Agent = LlmAgent


# ---------------------------------------------------------------------------
# Conversation building


def _is_empty(event: Event) -> bool:
    if not event.content or not event.content.parts:
        return True
    for p in event.content.parts:
        if p.function_call or p.function_response or p.inline_data or p.file_data:
            return False
        if p.text and not p.thought:
            return False
        if p.text and p.thought and event.content.role == "model":
            return False
    return True


def _present_other_agent(event: Event) -> Optional[Event]:
    if not event.content or not event.content.parts:
        return None
    parts = [types.Part(text="For context:")]
    for p in event.content.parts:
        if p.thought:
            continue
        if p.text:
            parts.append(types.Part(text=f"[{event.author}] said: {p.text}"))
        elif p.function_call:
            parts.append(types.Part(
                text=f"[{event.author}] called tool `{p.function_call.name}` with parameters: {p.function_call.args}"
            ))
        elif p.function_response:
            parts.append(types.Part(
                text=f"[{event.author}] `{p.function_response.name}` tool returned result: {p.function_response.response}"
            ))
    if len(parts) == 1:
        return None
    return Event(author="user", invocation_id=event.invocation_id, content=types.Content(role="user", parts=parts))


def build_contents(agent: LlmAgent, ic: InvocationContext) -> list[types.Content]:
    """The conversation an agent sees on its next model call.

    As a workflow node an agent sees its own node: the input it was handed
    plus its own calls, results and replies. Outside a workflow it sees the
    session (``include_contents="default"``) or only the current turn
    (``"none"``), with other agents' replies presented as context.
    """
    events = list(getattr(ic.session, "events", []) or [])
    node_path = ic.node_path
    if node_path:
        scoped = [e for e in events if e.node_info.path == node_path and not e.partial]
    else:
        scoped = [e for e in events if not e.partial and (ic.branch is None or not e.branch or
                  ic.branch == e.branch or ic.branch.startswith(e.branch + "."))]
        if agent.include_contents != "default":
            start = 0
            for i in range(len(scoped) - 1, -1, -1):
                e = scoped[i]
                if (e.author == "user" and not e.get_function_responses()) or (
                    e.author not in (agent.name, "user") and e.content
                ):
                    start = i
                    break
            scoped = scoped[start:]

    selected: list[Event] = []
    for e in scoped:
        if e.actions and e.actions.compaction and e.actions.compaction.compacted_content:
            continue
        if _is_empty(e):
            continue
        if e.author in (agent.name, "user"):
            selected.append(e)
        elif not node_path:
            converted = _present_other_agent(e)
            if converted is not None:
                selected.append(converted)
    selected = _apply_compaction(scoped, selected)
    selected = _pair_function_responses(selected)
    contents: list[types.Content] = []
    for e in selected:
        if e.content:
            contents.append(_copy_content(e.content))
    return contents


def _apply_compaction(all_events: list[Event], selected: list[Event]) -> list[Event]:
    compactions = [e for e in all_events if e.actions and e.actions.compaction and e.actions.compaction.compacted_content]
    if not compactions:
        return selected
    latest = max(compactions, key=lambda e: e.actions.compaction.end_timestamp)
    comp = latest.actions.compaction
    kept = [e for e in selected if not (comp.start_timestamp <= e.timestamp <= comp.end_timestamp)]
    summary = Event(author="user", content=types.Content(role="user", parts=list(comp.compacted_content.parts or [])))
    summary.timestamp = comp.start_timestamp
    return [summary] + kept


def _pair_function_responses(events: list[Event]) -> list[Event]:
    """Drops responses whose call is missing (a cut history must stay well-formed)."""
    call_ids: set[str] = set()
    out: list[Event] = []
    for e in events:
        for fc in e.get_function_calls():
            if fc.id:
                call_ids.add(fc.id)
        responses = e.get_function_responses()
        if responses and e.content:
            keep = [p for p in e.content.parts or [] if not p.function_response or not p.function_response.id
                    or p.function_response.id in call_ids]
            if not keep:
                continue
            if len(keep) != len(e.content.parts or []):
                e = e.model_copy(update={"content": types.Content(role=e.content.role, parts=keep)})
        out.append(e)
    return out


def _copy_content(content: types.Content) -> types.Content:
    new = content.model_copy()
    new.parts = [p.model_copy() for p in content.parts or []]
    return new


__all__ = [
    "Agent",
    "BaseAgent",
    "CallbackContext",
    "ContextCacheConfig",
    "DeltaState",
    "InvocationContext",
    "LlmAgent",
    "LlmCallsLimitExceededError",
    "ReadonlyContext",
    "RunConfig",
    "StreamingMode",
    "build_contents",
]
