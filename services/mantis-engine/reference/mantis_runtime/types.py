"""Content and request types for the Mantis runtime.

A small, dependency-free (pydantic only) set of message types that replaces
``google.genai.types``. Field names follow the Gemini wire vocabulary the
harness was written against (``Content``/``Part``/``FunctionCall``...), so
code that reads ``part.text`` or ``part.function_call.args`` is unchanged.
"""

from __future__ import annotations

import enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(
        extra="allow", arbitrary_types_allowed=True, populate_by_name=True,
        ser_json_bytes="base64", val_json_bytes="base64",
    )


class FinishReason(str, enum.Enum):
    FINISH_REASON_UNSPECIFIED = "FINISH_REASON_UNSPECIFIED"
    STOP = "STOP"
    MAX_TOKENS = "MAX_TOKENS"
    SAFETY = "SAFETY"
    RECITATION = "RECITATION"
    LANGUAGE = "LANGUAGE"
    OTHER = "OTHER"
    BLOCKLIST = "BLOCKLIST"
    PROHIBITED_CONTENT = "PROHIBITED_CONTENT"
    SPII = "SPII"
    MALFORMED_FUNCTION_CALL = "MALFORMED_FUNCTION_CALL"
    IMAGE_SAFETY = "IMAGE_SAFETY"
    UNEXPECTED_TOOL_CALL = "UNEXPECTED_TOOL_CALL"

    def __str__(self) -> str:  # "STOP", not "FinishReason.STOP"
        return self.value


class FunctionCall(_Model):
    id: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict[str, Any]] = None


class FunctionResponse(_Model):
    id: Optional[str] = None
    name: Optional[str] = None
    response: Optional[dict[str, Any]] = None


class Blob(_Model):
    mime_type: Optional[str] = None
    data: Optional[bytes] = None
    display_name: Optional[str] = None


class FileData(_Model):
    mime_type: Optional[str] = None
    file_uri: Optional[str] = None
    display_name: Optional[str] = None


class ExecutableCode(_Model):
    code: Optional[str] = None
    language: Optional[str] = None


class CodeExecutionResult(_Model):
    outcome: Optional[str] = None
    output: Optional[str] = None


class Part(_Model):
    text: Optional[str] = None
    thought: Optional[bool] = None
    thought_signature: Optional[bytes] = None
    function_call: Optional[FunctionCall] = None
    function_response: Optional[FunctionResponse] = None
    inline_data: Optional[Blob] = None
    file_data: Optional[FileData] = None
    executable_code: Optional[ExecutableCode] = None
    code_execution_result: Optional[CodeExecutionResult] = None

    @classmethod
    def from_text(cls, *, text: str) -> "Part":
        return cls(text=text)

    @classmethod
    def from_function_call(cls, *, name: str, args: dict[str, Any]) -> "Part":
        return cls(function_call=FunctionCall(name=name, args=args))

    @classmethod
    def from_function_response(cls, *, name: str, response: dict[str, Any]) -> "Part":
        return cls(function_response=FunctionResponse(name=name, response=response))

    @classmethod
    def from_bytes(cls, *, data: bytes, mime_type: str) -> "Part":
        return cls(inline_data=Blob(data=data, mime_type=mime_type))


class Content(_Model):
    role: Optional[str] = None
    parts: Optional[list[Part]] = None


class Schema(_Model):
    """JSON schema holder; the runtime passes JSON schema dicts through."""


class FunctionDeclaration(_Model):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters_json_schema: Optional[Any] = None
    parameters: Optional[Any] = None
    response_json_schema: Optional[Any] = None


class Tool(_Model):
    function_declarations: Optional[list[FunctionDeclaration]] = None


class FunctionCallingConfig(_Model):
    mode: Optional[str] = None
    allowed_function_names: Optional[list[str]] = None


class ToolConfig(_Model):
    function_calling_config: Optional[FunctionCallingConfig] = None


class ThinkingConfig(_Model):
    include_thoughts: Optional[bool] = None
    thinking_budget: Optional[int] = None


class GenerateContentConfig(_Model):
    system_instruction: Optional[Any] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[float] = None
    max_output_tokens: Optional[int] = None
    stop_sequences: Optional[list[str]] = None
    seed: Optional[int] = None
    tools: Optional[list[Any]] = None
    tool_config: Optional[ToolConfig] = None
    response_schema: Optional[Any] = None
    response_json_schema: Optional[Any] = None
    response_mime_type: Optional[str] = None
    thinking_config: Optional[ThinkingConfig] = None
    labels: Optional[dict[str, str]] = None
    cached_content: Optional[str] = None
    http_options: Optional[Any] = None


class GenerateContentResponseUsageMetadata(_Model):
    prompt_token_count: Optional[int] = None
    candidates_token_count: Optional[int] = None
    total_token_count: Optional[int] = None
    cached_content_token_count: Optional[int] = None
    thoughts_token_count: Optional[int] = None
    tool_use_prompt_token_count: Optional[int] = None


class GroundingMetadata(_Model):
    pass


def content_text(content: Optional[Content], *, include_thoughts: bool = False) -> str:
    """Concatenated text of a content's parts (thoughts excluded by default)."""
    if content is None or not content.parts:
        return ""
    return "".join(
        p.text for p in content.parts if p.text and (include_thoughts or not p.thought)
    )


__all__ = [
    "Blob",
    "CodeExecutionResult",
    "Content",
    "ExecutableCode",
    "FileData",
    "FinishReason",
    "FunctionCall",
    "FunctionCallingConfig",
    "FunctionDeclaration",
    "FunctionResponse",
    "GenerateContentConfig",
    "GenerateContentResponseUsageMetadata",
    "GroundingMetadata",
    "Part",
    "Schema",
    "ThinkingConfig",
    "Tool",
    "ToolConfig",
    "content_text",
]
