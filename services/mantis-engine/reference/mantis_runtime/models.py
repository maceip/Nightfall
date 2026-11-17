"""Model request/response envelopes and the model base class."""

from __future__ import annotations

import logging
from typing import Any, AsyncGenerator, Optional

from pydantic import BaseModel, ConfigDict, Field

from . import types

logger = logging.getLogger("mantis_runtime.models")


class LlmRequest(BaseModel):
    """One request to a model: conversation, config and the callable tools."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    model: Optional[str] = None
    contents: list[types.Content] = Field(default_factory=list)
    config: types.GenerateContentConfig = Field(default_factory=types.GenerateContentConfig)
    tools_dict: dict[str, Any] = Field(default_factory=dict, exclude=True)
    cache_config: Optional[Any] = None
    cacheable_contents_token_count: Optional[int] = None

    def append_instructions(self, instructions: list[str] | types.Content) -> list[types.Content]:
        if isinstance(instructions, types.Content):
            texts = [p.text for p in instructions.parts or [] if p.text]
            if texts:
                self._append_system_text("\n\n".join(texts))
            return []
        if isinstance(instructions, list) and all(isinstance(i, str) for i in instructions):
            if instructions:
                self._append_system_text("\n\n".join(instructions))
            return []
        raise TypeError(
            "instructions must be list[str] or types.Content, got "
            f"{type(instructions).__name__}."
        )

    def _append_system_text(self, text: str) -> None:
        si = self.config.system_instruction
        if not si:
            self.config.system_instruction = text
        elif isinstance(si, str):
            self.config.system_instruction = si + "\n\n" + text
        else:
            logger.warning("Cannot append to non-string system_instruction (%s)", type(si))

    def append_tools(self, tools: list[Any]) -> None:
        if not tools:
            return
        declarations = []
        for tool in tools:
            decl = tool._get_declaration()
            if decl is None:
                continue
            declarations.append(decl)
            if tool.name in self.tools_dict:
                logger.warning("Duplicate tool name %r: the earlier tool is shadowed.", tool.name)
            self.tools_dict[tool.name] = tool
        if not declarations:
            return
        if self.config.tools is None:
            self.config.tools = []
        existing = next(
            (t for t in self.config.tools if isinstance(t, types.Tool) and t.function_declarations),
            None,
        )
        if existing is not None:
            existing.function_declarations.extend(declarations)
        else:
            self.config.tools.append(types.Tool(function_declarations=declarations))

    def set_output_schema(self, schema: Any) -> None:
        self.config.response_schema = schema
        self.config.response_mime_type = "application/json"


class LlmResponse(BaseModel):
    """One model response, or one streamed chunk of one."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    content: Optional[types.Content] = None
    partial: Optional[bool] = None
    turn_complete: Optional[bool] = None
    finish_reason: Optional[Any] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    interrupted: Optional[bool] = None
    usage_metadata: Optional[types.GenerateContentResponseUsageMetadata] = None
    custom_metadata: Optional[dict[str, Any]] = None
    model_version: Optional[str] = None
    grounding_metadata: Optional[Any] = None
    citation_metadata: Optional[Any] = None
    avg_logprobs: Optional[float] = None
    cache_metadata: Optional[Any] = None

    def get_function_calls(self) -> list[types.FunctionCall]:
        if not self.content or not self.content.parts:
            return []
        return [p.function_call for p in self.content.parts if p.function_call]

    def get_function_responses(self) -> list[types.FunctionResponse]:
        if not self.content or not self.content.parts:
            return []
        return [p.function_response for p in self.content.parts if p.function_response]


class BaseLlm(BaseModel):
    """Base class for model adapters."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    model: str = ""

    @classmethod
    def supported_models(cls) -> list[str]:
        return []

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        raise NotImplementedError(f"{type(self).__name__}.generate_content_async")
        yield  # pragma: no cover


def has_meaningful_content(response: Any) -> bool:
    """True if a response carries anything beyond thoughts and whitespace."""
    content = getattr(response, "content", None)
    if content is None or not getattr(content, "parts", None):
        return False
    for part in content.parts:
        if getattr(part, "function_call", None) is not None:
            return True
        if getattr(part, "function_response", None) is not None:
            return True
        if getattr(part, "executable_code", None) is not None:
            return True
        if getattr(part, "code_execution_result", None) is not None:
            return True
        if getattr(part, "inline_data", None) is not None or getattr(part, "file_data", None) is not None:
            return True
        text = getattr(part, "text", None)
        if text and not getattr(part, "thought", False) and text.strip():
            return True
    return False


__all__ = ["BaseLlm", "LlmRequest", "LlmResponse", "has_meaningful_content"]
