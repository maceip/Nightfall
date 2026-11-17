"""Model adapter over LiteLLM.

Converts the runtime's ``Content`` conversation to OpenAI-style chat messages,
calls ``litellm.acompletion`` through a swappable client, and converts the
answer (streamed or not) back into ``LlmResponse`` objects. Provider quirks
that matter for the harness are kept: reasoning/thinking parts with their
signatures (Anthropic thinking blocks, Gemini thought signatures on tool
calls), cached-token accounting, finish-reason to error-code mapping, and
healing of tool calls left without a result.
"""

from __future__ import annotations

import base64
import binascii
import copy
import json
import logging
from typing import Any, AsyncGenerator, Optional

from pydantic import Field, PrivateAttr

from . import types
from .models import BaseLlm, LlmRequest, LlmResponse

logger = logging.getLogger("mantis_runtime.lite_llm")

_FINISH_REASON_MAPPING = {
    "length": types.FinishReason.MAX_TOKENS,
    "stop": types.FinishReason.STOP,
    "tool_calls": types.FinishReason.STOP,
    "function_call": types.FinishReason.STOP,
    "content_filter": types.FinishReason.SAFETY,
}
_STREAM_ENDED_WITHOUT_FINISH_REASON = "stream_ended_without_finish_reason"
_MISSING_TOOL_RESULT_MESSAGE = (
    "Error: Missing tool result (tool execution may have been interrupted "
    "before a response was recorded)."
)
_FALLBACK_USER_TEXT = "Handle the requests as specified in the System Instruction."
_THOUGHT_SIGNATURE_SEPARATOR = "__thought__"


class LlmCapabilities:
    def __init__(self, output_schema_and_tools: bool = False):
        self.output_schema_and_tools = output_schema_and_tools


def _g(obj: Any, key: str, default: Any = None) -> Any:
    """Dict-or-attribute access that tolerates litellm objects and mocks."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    getter = getattr(obj, "get", None)
    if callable(getter):
        try:
            value = getter(key, default)
            if value is not default or not hasattr(obj, key):
                return value
        except Exception:
            pass
    return getattr(obj, key, default)


def _ensure_litellm():
    import litellm  # noqa: F401  (import cost paid on first use)

    return litellm


class LiteLLMClient:
    """Thin seam over litellm so tests and wrappers can intercept calls."""

    async def acompletion(self, model: Any, messages: Any, tools: Any = None, **kwargs: Any) -> Any:
        litellm = _ensure_litellm()
        return await litellm.acompletion(model=model, messages=messages, tools=tools, **kwargs)

    def completion(self, model: Any, messages: Any, tools: Any = None, stream: bool = False, **kwargs: Any) -> Any:
        litellm = _ensure_litellm()
        return litellm.completion(model=model, messages=messages, tools=tools, stream=stream, **kwargs)


# ---------------------------------------------------------------------------
# Provider detection


def _strip_proxy_prefix(model: str) -> str:
    return model.split("/", 1)[1] if model.startswith("litellm_proxy/") else model


def _get_provider_from_model(model: str) -> str:
    if not model:
        return ""
    if "/" in model:
        return model.split("/", 1)[0].lower()
    lower = model.lower()
    if "claude" in lower:
        return "anthropic"
    if lower.startswith(("gpt", "o1", "o3", "o4")):
        return "openai"
    if "gemini" in lower:
        return "gemini"
    return ""


def _is_anthropic_model(model_string: str) -> bool:
    lower = (model_string or "").lower()
    return lower.startswith(("anthropic/", "bedrock/anthropic", "vertex_ai/claude")) or "claude" in lower


def _is_anthropic_route(provider: str, model: str) -> bool:
    return provider in ("anthropic", "bedrock") or _is_anthropic_model(model)


def _is_litellm_gemini_model(model_string: str) -> bool:
    lower = (model_string or "").lower()
    return lower.startswith(("gemini/", "vertex_ai/gemini"))


def _is_litellm_vertex_model(model_string: str) -> bool:
    return (model_string or "").lower().startswith("vertex_ai/")


# ---------------------------------------------------------------------------
# Request conversion


def _safe_json_serialize(obj: object) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except (TypeError, ValueError, OverflowError, RecursionError):
        return str(obj)


def _encode_sig(sig: Any) -> str:
    if isinstance(sig, bytes):
        return base64.b64encode(sig).decode("utf-8")
    return str(sig)


def _decode_thought_signature(value: Any) -> Optional[bytes]:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value
    try:
        return base64.b64decode(str(value), validate=True)
    except (binascii.Error, ValueError):
        return str(value).encode("utf-8")


def _to_litellm_role(role: Optional[str]) -> str:
    return "assistant" if role in ("model", "assistant") else "user"


def _user_content(parts: list[types.Part]) -> Any:
    blocks: list[dict[str, Any]] = []
    for part in parts:
        if part.text:
            blocks.append({"type": "text", "text": part.text})
        elif part.inline_data and part.inline_data.data is not None:
            mime = part.inline_data.mime_type or "application/octet-stream"
            data = base64.b64encode(part.inline_data.data).decode("utf-8")
            if mime.startswith("text/"):
                try:
                    blocks.append({"type": "text", "text": part.inline_data.data.decode("utf-8")})
                    continue
                except UnicodeDecodeError:
                    pass
            blocks.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}})
        elif part.file_data and part.file_data.file_uri:
            blocks.append({"type": "file", "file": {"file_id": part.file_data.file_uri}})
    if len(blocks) == 1 and blocks[0]["type"] == "text":
        return blocks[0]["text"]
    if all(b["type"] == "text" for b in blocks):
        return "\n".join(b["text"] for b in blocks) if blocks else None
    return blocks or None


def content_to_messages(content: types.Content, *, model: str = "") -> list[dict[str, Any]]:
    """One Content as zero or more chat messages."""
    parts = content.parts or []
    if not parts:
        return []
    tool_messages: list[dict[str, Any]] = []
    rest: list[types.Part] = []
    for part in parts:
        if part.function_response:
            fr = part.function_response
            resp = fr.response
            tool_messages.append({
                "role": "tool",
                "tool_call_id": fr.id or "",
                "content": resp if isinstance(resp, str) else _safe_json_serialize(resp),
            })
        else:
            rest.append(part)
    if tool_messages:
        if not rest:
            return tool_messages
        return tool_messages + content_to_messages(types.Content(role=content.role, parts=rest), model=model)

    if _to_litellm_role(content.role) == "user":
        user_parts = [p for p in parts if not p.thought]
        return [{"role": "user", "content": _user_content(user_parts)}]

    tool_calls: list[dict[str, Any]] = []
    text_parts: list[str] = []
    reasoning: list[types.Part] = []
    for part in parts:
        if part.function_call:
            fc = part.function_call
            if not fc.name:
                raise ValueError("LiteLLM function calls require a name")
            call: dict[str, Any] = {
                "type": "function",
                "id": fc.id or "",
                "function": {"name": fc.name, "arguments": _safe_json_serialize(fc.args or {})},
            }
            if part.thought_signature:
                sig = _encode_sig(part.thought_signature)
                call["provider_specific_fields"] = {"thought_signature": sig}
                call["extra_content"] = {"google": {"thought_signature": sig}}
            tool_calls.append(call)
        elif part.thought:
            reasoning.append(part)
        elif part.text:
            text_parts.append(part.text)
    text = "\n".join(text_parts) if text_parts else None
    message: dict[str, Any] = {"role": "assistant", "content": text, "tool_calls": tool_calls or None}
    if reasoning:
        signed = [p for p in reasoning if p.text and p.thought_signature]
        if signed and _is_anthropic_model(model):
            message["thinking_blocks"] = [
                {"type": "thinking", "thinking": p.text, "signature": _encode_sig(p.thought_signature)}
                for p in signed
            ]
        else:
            merged = "".join(p.text or "" for p in reasoning)
            if merged:
                message["reasoning_content"] = merged
    return [message]


def _ensure_tool_results(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Adds a placeholder result for any tool call left without one."""
    healed: list[dict[str, Any]] = []
    pending: list[str] = []
    for message in messages:
        role = message.get("role")
        if pending and role != "tool":
            healed.extend(
                {"role": "tool", "tool_call_id": cid, "content": _MISSING_TOOL_RESULT_MESSAGE} for cid in pending
            )
            pending = []
        if role == "assistant":
            pending = [c.get("id") for c in message.get("tool_calls") or [] if c.get("id")]
        elif role == "tool" and message.get("tool_call_id") in pending:
            pending.remove(message.get("tool_call_id"))
        healed.append(message)
    if pending:
        healed.extend(
            {"role": "tool", "tool_call_id": cid, "content": _MISSING_TOOL_RESULT_MESSAGE} for cid in pending
        )
    return healed


def _lowercase_types(schema: Any) -> Any:
    if isinstance(schema, dict):
        out = {}
        for k, v in schema.items():
            if k == "type" and isinstance(v, str):
                out[k] = v.lower()
            else:
                out[k] = _lowercase_types(v)
        return out
    if isinstance(schema, list):
        return [_lowercase_types(v) for v in schema]
    return schema


def _function_declaration_to_tool_param(decl: types.FunctionDeclaration) -> dict[str, Any]:
    if decl.parameters_json_schema:
        params = _lowercase_types(copy.deepcopy(decl.parameters_json_schema))
    elif isinstance(decl.parameters, dict):
        params = _lowercase_types(copy.deepcopy(decl.parameters))
    elif decl.parameters is not None and hasattr(decl.parameters, "model_dump"):
        params = _lowercase_types(decl.parameters.model_dump(exclude_none=True))
    else:
        params = {"type": "object", "properties": {}}
    params.setdefault("type", "object")
    params.setdefault("properties", {})
    return {
        "type": "function",
        "function": {"name": decl.name, "description": decl.description or "", "parameters": params},
    }


def _enforce_strict_openai_schema(schema: Any) -> None:
    if isinstance(schema, dict):
        if schema.get("type") == "object" and isinstance(schema.get("properties"), dict):
            schema["additionalProperties"] = False
            schema["required"] = list(schema["properties"].keys())
        for v in schema.values():
            _enforce_strict_openai_schema(v)
    elif isinstance(schema, list):
        for v in schema:
            _enforce_strict_openai_schema(v)


def _to_litellm_response_format(response_schema: Any, model: str) -> Optional[dict[str, Any]]:
    from pydantic import BaseModel

    name = "response"
    if isinstance(response_schema, dict):
        schema_dict = copy.deepcopy(response_schema)
        name = str(schema_dict.get("title", name))
    elif isinstance(response_schema, type) and issubclass(response_schema, BaseModel):
        schema_dict = response_schema.model_json_schema()
        name = response_schema.__name__
    elif hasattr(response_schema, "model_dump"):
        schema_dict = response_schema.model_dump(exclude_none=True, mode="json")
        name = type(response_schema).__name__
    else:
        return None
    if _is_litellm_gemini_model(model):
        return {"type": "json_object", "response_schema": schema_dict}
    schema_dict = _lowercase_types(schema_dict)
    _enforce_strict_openai_schema(schema_dict)
    return {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema_dict}}


def _system_text(config: Optional[types.GenerateContentConfig]) -> Optional[str]:
    if config is None or not config.system_instruction:
        return None
    si = config.system_instruction
    if isinstance(si, str):
        return si
    if isinstance(si, types.Content):
        return "\n\n".join(p.text for p in si.parts or [] if p.text) or None
    if isinstance(si, list):
        return "\n\n".join(str(x) for x in si)
    return str(si)


async def _get_completion_inputs(
    llm_request: LlmRequest, model: str, *args: Any, **kwargs: Any
) -> tuple[list[dict[str, Any]], Optional[list[dict[str, Any]]], Optional[dict[str, Any]], Optional[dict[str, Any]], Optional[str]]:
    """(messages, tools, response_format, generation_params, tool_choice)."""
    messages: list[dict[str, Any]] = []
    for content in llm_request.contents or []:
        messages.extend(content_to_messages(content, model=model))
    system = _system_text(llm_request.config)
    if system:
        messages.insert(0, {"role": "system", "content": system})
    messages = _ensure_tool_results(messages)

    tools: Optional[list[dict[str, Any]]] = None
    cfg = llm_request.config
    if cfg and cfg.tools:
        tools = []
        for tool in cfg.tools:
            if isinstance(tool, types.Tool) and tool.function_declarations:
                tools.extend(_function_declaration_to_tool_param(d) for d in tool.function_declarations)
        tools = tools or None

    response_format = None
    if cfg and cfg.response_schema:
        response_format = _to_litellm_response_format(cfg.response_schema, model=model)

    generation_params: Optional[dict[str, Any]] = None
    if cfg:
        mapping = {"max_output_tokens": "max_completion_tokens", "stop_sequences": "stop"}
        generation_params = {}
        for key in ("temperature", "max_output_tokens", "top_p", "top_k", "seed", "stop_sequences"):
            value = getattr(cfg, key, None)
            if value is not None:
                generation_params[mapping.get(key, key)] = value
        generation_params = generation_params or None

    tool_choice = None
    if cfg and cfg.tool_config and cfg.tool_config.function_calling_config:
        mode = str(cfg.tool_config.function_calling_config.mode or "").upper()
        if mode.endswith("ANY"):
            tool_choice = "required"
        elif mode.endswith("NONE"):
            tool_choice = "none"
    if not tools:
        tool_choice = None
    return messages, tools, response_format, generation_params, tool_choice


# ---------------------------------------------------------------------------
# Response conversion


def _map_finish_reason(finish_reason: Any) -> Optional[types.FinishReason]:
    if not finish_reason:
        return None
    if isinstance(finish_reason, types.FinishReason):
        return finish_reason
    return _FINISH_REASON_MAPPING.get(str(finish_reason).lower(), types.FinishReason.OTHER)


def _stamp_finish_reason(resp: LlmResponse, finish_reason: Any) -> None:
    mapped = _map_finish_reason(finish_reason)
    if mapped is None:
        return
    if resp.finish_reason == types.FinishReason.MALFORMED_FUNCTION_CALL and mapped == types.FinishReason.STOP:
        return
    malformed_msg = resp.error_message if resp.finish_reason == types.FinishReason.MALFORMED_FUNCTION_CALL else None
    resp.finish_reason = mapped
    if mapped == types.FinishReason.STOP:
        resp.error_code = None
        resp.error_message = None
        return
    resp.error_code = mapped
    resp.error_message = "Maximum tokens reached" if mapped == types.FinishReason.MAX_TOKENS else f"Finished with {mapped.name}"
    if malformed_msg:
        resp.error_message += ". " + malformed_msg
    if finish_reason == _STREAM_ENDED_WITHOUT_FINISH_REASON:
        resp.error_message = "The stream ended without a finish reason; the response may be truncated."


def _iter_reasoning_texts(value: Any):
    if value is None:
        return
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _iter_reasoning_texts(item)
    elif isinstance(value, dict):
        for key in ("thinking", "text", "content", "reasoning"):
            v = value.get(key)
            if isinstance(v, str):
                yield v
                return
    else:
        text = getattr(value, "text", None) or getattr(value, "thinking", None)
        if isinstance(text, str):
            yield text


def _reasoning_parts(value: Any) -> list[types.Part]:
    if isinstance(value, list):
        out: list[types.Part] = []
        for block in value:
            if isinstance(block, dict) and block.get("type") == "redacted":
                continue
            if isinstance(block, dict) and block.get("type") == "thinking":
                text = block.get("thinking", "")
                sig = block.get("signature")
                if text or sig:
                    part = types.Part(text=text, thought=True)
                    if sig:
                        part.thought_signature = _decode_thought_signature(sig)
                    out.append(part)
                continue
            out.extend(types.Part(text=t, thought=True) for t in _iter_reasoning_texts(block) if t)
        return out
    return [types.Part(text=t, thought=True) for t in _iter_reasoning_texts(value) if t]


def _reasoning_value(message: Any) -> Any:
    for key in ("thinking_blocks", "reasoning_content", "reasoning"):
        value = _g(message, key)
        if value is not None:
            return value
    return None


def _tool_call_signature(tool_call: Any) -> Optional[bytes]:
    extra = _g(tool_call, "extra_content")
    if isinstance(extra, dict) and isinstance(extra.get("google"), dict):
        sig = extra["google"].get("thought_signature")
        if sig:
            return _decode_thought_signature(sig)
    psf = _g(tool_call, "provider_specific_fields")
    if isinstance(psf, dict) and psf.get("thought_signature"):
        return _decode_thought_signature(psf["thought_signature"])
    fn = _g(tool_call, "function")
    fpsf = _g(fn, "provider_specific_fields") if fn is not None else None
    if isinstance(fpsf, dict) and fpsf.get("thought_signature"):
        return _decode_thought_signature(fpsf["thought_signature"])
    return None


def _parse_args(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw
    if raw is None or raw == "":
        return {}
    return json.loads(raw)


def _usage_metadata(usage: Any) -> Optional[types.GenerateContentResponseUsageMetadata]:
    if not usage:
        return None
    if hasattr(usage, "model_dump"):
        try:
            usage = usage.model_dump()
        except Exception:
            pass

    def num(key: str) -> int:
        v = _g(usage, key, 0)
        return int(v) if isinstance(v, (int, float)) else 0

    cached = 0
    details = _g(usage, "prompt_tokens_details")
    if isinstance(details, dict) and isinstance(details.get("cached_tokens"), int):
        cached = details["cached_tokens"]
    elif details is not None and isinstance(getattr(details, "cached_tokens", None), int):
        cached = details.cached_tokens
    if not cached:
        for key in ("cached_prompt_tokens", "cached_tokens", "cache_read_input_tokens"):
            if isinstance(_g(usage, key), int):
                cached = _g(usage, key)
                break
    reasoning = 0
    cdetails = _g(usage, "completion_tokens_details")
    if isinstance(cdetails, dict) and isinstance(cdetails.get("reasoning_tokens"), int):
        reasoning = cdetails["reasoning_tokens"]
    elif cdetails is not None and isinstance(getattr(cdetails, "reasoning_tokens", None), int):
        reasoning = cdetails.reasoning_tokens
    meta = types.GenerateContentResponseUsageMetadata(
        prompt_token_count=num("prompt_tokens"),
        candidates_token_count=num("completion_tokens"),
        total_token_count=num("total_tokens"),
        cached_content_token_count=cached,
        thoughts_token_count=reasoning or None,
    )
    creation = _g(usage, "cache_creation_input_tokens")
    if isinstance(creation, int):
        object.__setattr__(meta, "cache_creation_input_tokens", creation)
    return meta


def message_to_response(
    message: Any, *, is_partial: bool = False, model_version: Optional[str] = None,
    thought_parts: Optional[list[types.Part]] = None,
) -> LlmResponse:
    parts: list[types.Part] = list(thought_parts or _reasoning_parts(_reasoning_value(message)))
    content = _g(message, "content")
    if isinstance(content, list):
        content = "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    if isinstance(content, str) and content:
        parts.append(types.Part(text=content))
    malformed: list[str] = []
    for tc in _g(message, "tool_calls") or []:
        if _g(tc, "type", "function") != "function":
            continue
        fn = _g(tc, "function")
        name = _g(fn, "name")
        try:
            args = _parse_args(_g(fn, "arguments"))
        except (json.JSONDecodeError, TypeError):
            args = None
        if not isinstance(args, dict):
            malformed.append(name or "<unnamed>")
            continue
        raw_id = _g(tc, "id") or ""
        call_id = raw_id.split(_THOUGHT_SIGNATURE_SEPARATOR, 1)[0] if _THOUGHT_SIGNATURE_SEPARATOR in raw_id else raw_id
        part = types.Part(function_call=types.FunctionCall(id=call_id or None, name=name, args=args))
        sig = _tool_call_signature(tc)
        if sig:
            part.thought_signature = sig
        parts.append(part)
    resp = LlmResponse(
        content=types.Content(role="model", parts=parts), partial=is_partial or None, model_version=model_version
    )
    if is_partial:
        resp.partial = True
    if malformed and not is_partial:
        resp.finish_reason = types.FinishReason.MALFORMED_FUNCTION_CALL
        resp.error_code = types.FinishReason.MALFORMED_FUNCTION_CALL
        resp.error_message = (
            "Arguments for the following function calls were not a valid JSON object: " + ", ".join(malformed)
        )
    return resp


def model_response_to_llm_response(response: Any) -> LlmResponse:
    choices = _g(response, "choices") or []
    message = None
    finish_reason = None
    if choices:
        first = choices[0]
        message = _g(first, "message")
        finish_reason = _g(first, "finish_reason")
    model_version = _g(response, "model")
    if message is not None:
        resp = message_to_response(message, model_version=model_version)
    else:
        resp = LlmResponse(content=types.Content(role="model", parts=[]), model_version=model_version)
    _stamp_finish_reason(resp, finish_reason)
    meta = _usage_metadata(_g(response, "usage"))
    if meta is not None:
        resp.usage_metadata = meta
    return resp


# Backwards-compatible names used by harness code and tests.
_model_response_to_generate_content_response = model_response_to_llm_response
_message_to_generate_content_response = message_to_response


def _append_fallback_user_content_if_missing(llm_request: LlmRequest) -> None:
    for content in reversed(llm_request.contents):
        if content.role == "user":
            parts = content.parts or []
            if any(
                p.text or p.inline_data or p.file_data or p.function_response for p in parts
            ):
                return
            parts.append(types.Part(text=_FALLBACK_USER_TEXT))
            content.parts = parts
            return
    llm_request.contents.append(types.Content(role="user", parts=[types.Part(text=_FALLBACK_USER_TEXT)]))


def _drop_params_rejected_by_anthropic_thinking(params: dict[str, Any]) -> None:
    thinking = params.get("thinking")
    if isinstance(thinking, dict) and thinking.get("type") in ("enabled", "adaptive"):
        for key in ("temperature", "top_p", "top_k"):
            params.pop(key, None)


class LiteLlm(BaseLlm):
    """Any LiteLLM-routable model (``provider/model``)."""

    llm_client: Any = Field(default_factory=LiteLLMClient, exclude=True)
    _additional_args: dict[str, Any] = PrivateAttr(default_factory=dict)

    def __init__(self, model: str, **kwargs: Any) -> None:
        drop_params = kwargs.pop("drop_params", None)
        client = kwargs.pop("llm_client", None)
        super().__init__(model=model)
        if client is not None:
            self.llm_client = client
        extra = dict(kwargs)
        for key in ("messages", "tools", "stream"):
            extra.pop(key, None)
        if drop_params is not None:
            extra["drop_params"] = drop_params
        self._additional_args = extra

    @property
    def capabilities(self) -> LlmCapabilities:
        return LlmCapabilities(output_schema_and_tools=False)

    @classmethod
    def supported_models(cls) -> list[str]:
        return [r".*"]

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        _append_fallback_user_content_if_missing(llm_request)
        model = llm_request.model or self.model
        messages, tools, response_format, generation_params, tool_choice = await _get_completion_inputs(
            llm_request, model
        )
        args: dict[str, Any] = {"model": model, "messages": messages, "tools": tools, "response_format": response_format}
        args.update(self._additional_args)
        if generation_params:
            if "max_completion_tokens" in generation_params:
                args.pop("max_tokens", None)
            args.update(generation_params)
        if _is_anthropic_model(model):
            _drop_params_rejected_by_anthropic_thinking(args)
        if tool_choice is not None:
            args["tool_choice"] = tool_choice
        http = llm_request.config.http_options if llm_request.config else None
        if http is not None:
            headers = _g(http, "headers")
            if headers:
                extra = dict(args.get("extra_headers") or {})
                extra.update(headers)
                args["extra_headers"] = extra
            timeout = _g(http, "timeout")
            if timeout is not None:
                args["timeout"] = timeout / 1000

        if not stream:
            response = await self.llm_client.acompletion(**args)
            yield model_response_to_llm_response(response)
            return

        args["stream"] = True
        args["stream_options"] = {"include_usage": True}
        async for item in self._stream(args, model):
            yield item

    async def _stream(self, args: dict[str, Any], model: str) -> AsyncGenerator[LlmResponse, None]:
        text_parts: list[str] = []
        reasoning: list[types.Part] = []
        calls: dict[int, dict[str, Any]] = {}
        usage = None
        finish: Optional[str] = None
        model_version: Optional[str] = None

        stream_obj = await self.llm_client.acompletion(**args)
        async for chunk in stream_obj:
            model_version = _g(chunk, "model") or model_version
            choices = _g(chunk, "choices") or []
            choice = next((c for c in choices if not _g(c, "index")), None)
            if choice is not None:
                fr = _g(choice, "finish_reason")
                if fr:
                    finish = fr
                delta = _g(choice, "delta") or _g(choice, "message")
                if delta is not None:
                    rparts = _reasoning_parts(_reasoning_value(delta))
                    if rparts:
                        reasoning.extend(rparts)
                        yield LlmResponse(
                            content=types.Content(role="model", parts=list(rparts)),
                            partial=True, model_version=model_version,
                        )
                    text = _g(delta, "content")
                    if isinstance(text, str) and text:
                        text_parts.append(text)
                        yield LlmResponse(
                            content=types.Content(role="model", parts=[types.Part(text=text)]),
                            partial=True, model_version=model_version,
                        )
                    for i, tc in enumerate(_g(delta, "tool_calls") or []):
                        idx = _g(tc, "index", i)
                        idx = i if idx is None else idx
                        slot = calls.setdefault(idx, {"id": None, "name": "", "args": [], "sig": None})
                        fn = _g(tc, "function")
                        if _g(tc, "id"):
                            slot["id"] = _g(tc, "id")
                        if fn is not None:
                            if _g(fn, "name"):
                                slot["name"] += _g(fn, "name")
                            if _g(fn, "arguments"):
                                slot["args"].append(_g(fn, "arguments"))
                        sig = _tool_call_signature(tc)
                        if sig:
                            slot["sig"] = sig
                        yield LlmResponse(
                            content=types.Content(role="model", parts=[types.Part(
                                function_call=types.FunctionCall(id=slot["id"], name=slot["name"] or None)
                            )]),
                            partial=True, model_version=model_version,
                        )
            u = _g(chunk, "usage")
            if u:
                usage = _usage_metadata(u)

        model_version = model_version or model
        final_text = "".join(text_parts) or None
        tool_calls = []
        incomplete = False
        for idx in sorted(calls):
            slot = calls[idx]
            raw = "".join(slot["args"])
            try:
                parsed = _parse_args(raw)
            except json.JSONDecodeError:
                incomplete = True
                continue
            tc: dict[str, Any] = {
                "type": "function",
                "id": slot["id"] or str(idx),
                "function": {"name": slot["name"], "arguments": json.dumps(parsed)},
            }
            if slot["sig"]:
                tc["extra_content"] = {"google": {"thought_signature": _encode_sig(slot["sig"])}}
            tool_calls.append(tc)

        if incomplete:
            if finish == "length":
                resp = LlmResponse(
                    error_code=types.FinishReason.MAX_TOKENS,
                    error_message=(
                        "Tool call arguments were truncated while streaming and could not be parsed as "
                        "valid JSON. Increase `max_output_tokens` and retry."
                    ),
                    finish_reason=types.FinishReason.MAX_TOKENS,
                    model_version=model_version,
                )
            else:
                resp = LlmResponse(
                    error_code=types.FinishReason.MALFORMED_FUNCTION_CALL,
                    error_message=(
                        "A tool call's arguments could not be parsed as valid JSON. The stream carrying "
                        "them most likely ended early."
                    ),
                    finish_reason=types.FinishReason.MALFORMED_FUNCTION_CALL,
                    model_version=model_version,
                )
        else:
            merged_thoughts = _merge_streamed_thoughts(reasoning)
            resp = message_to_response(
                {"role": "assistant", "content": final_text, "tool_calls": tool_calls or None},
                model_version=model_version, thought_parts=merged_thoughts,
            )
            fin = finish or (
                "tool_calls" if tool_calls else (_STREAM_ENDED_WITHOUT_FINISH_REASON if (final_text or reasoning) else "stop")
            )
            _stamp_finish_reason(resp, fin)
        if usage is not None:
            resp.usage_metadata = usage
        yield resp


def _merge_streamed_thoughts(parts: list[types.Part]) -> list[types.Part]:
    """Joins streamed thought fragments; a signature closes a block."""
    out: list[types.Part] = []
    buf: list[str] = []
    for part in parts:
        if part.text:
            buf.append(part.text)
        if part.thought_signature:
            out.append(types.Part(text="".join(buf), thought=True, thought_signature=part.thought_signature))
            buf = []
    if buf:
        out.append(types.Part(text="".join(buf), thought=True))
    return out


__all__ = [
    "LiteLLMClient",
    "LiteLlm",
    "LlmCapabilities",
    "_get_completion_inputs",
    "_is_anthropic_model",
    "content_to_messages",
    "message_to_response",
    "model_response_to_llm_response",
]
