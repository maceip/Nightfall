"""Application wiring: the root node plus run-wide settings."""

from __future__ import annotations

from typing import Any, Optional

from . import types
from .events import Event, EventActions, EventCompaction
from .models import BaseLlm, LlmRequest

DEFAULT_PROMPT_TEMPLATE = (
    "The following is a conversation history between a user and an AI agent. Please summarize the "
    "conversation, focusing on key information and decisions made, as well as any unresolved questions "
    "or tasks. The summary should be concise and capture the essence of the interaction.\n\n"
    "{conversation_history}"
)


class ResumabilityConfig:
    def __init__(self, is_resumable: bool = False):
        self.is_resumable = is_resumable


class EventsCompactionConfig:
    """Summarise old events once a session grows past ``token_threshold`` prompt tokens."""

    def __init__(self, *, compaction_interval: int = 0, overlap_size: int = 0, summarizer: Any = None,
                 token_threshold: Optional[int] = None, event_retention_size: Optional[int] = None, **kwargs: Any):
        self.compaction_interval = compaction_interval
        self.overlap_size = overlap_size
        self.summarizer = summarizer
        self.token_threshold = token_threshold
        self.event_retention_size = event_retention_size
        for k, v in kwargs.items():
            setattr(self, k, v)


class LlmEventSummarizer:
    """Summarises a run of events into one compaction event with a model."""

    MAX_FIELD_CHARS = 2000

    def __init__(self, llm: BaseLlm, prompt_template: Optional[str] = None):
        self._llm = llm
        self._prompt_template = prompt_template or DEFAULT_PROMPT_TEMPLATE

    def _truncate(self, text: str, limit: Optional[int] = None) -> str:
        limit = limit or self.MAX_FIELD_CHARS
        return text if len(text) <= limit else text[:limit] + "... [truncated]"

    def _format_events_for_prompt(self, events: list[Event]) -> str:
        lines = []
        for event in events:
            if not (event.content and event.content.parts):
                continue
            for part in event.content.parts:
                if part.text and not part.thought:
                    lines.append(f"{event.author}: {part.text}")
                if part.function_call:
                    lines.append(
                        f"{event.author} called tool: {part.function_call.name}"
                        f"({self._truncate(str(part.function_call.args))})"
                    )
                if part.function_response:
                    lines.append(
                        f"Tool response from {part.function_response.name}: "
                        f"{self._truncate(str(part.function_response.response))}"
                    )
        return "\n".join(lines)

    async def maybe_summarize_events(self, *, events: list[Event]) -> Optional[Event]:
        if not events:
            return None
        history = self._format_events_for_prompt(events)
        prompt = self._prompt_template.format(conversation_history=history)
        request = LlmRequest(
            model=getattr(self._llm, "model", None),
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        )
        summary = ""
        usage = None
        async for resp in self._llm.generate_content_async(request, stream=False):
            if resp.content:
                summary += types.content_text(resp.content)
            if resp.usage_metadata is not None:
                usage = resp.usage_metadata
        if not summary:
            return None
        compaction = EventCompaction(
            start_timestamp=events[0].timestamp,
            end_timestamp=events[-1].timestamp,
            compacted_content=types.Content(role="model", parts=[types.Part(text=summary)]),
        )
        return Event(author="user", actions=EventActions(compaction=compaction), usage_metadata=usage)


class App:
    def __init__(
        self,
        *,
        name: str,
        root_agent: Any,
        plugins: Optional[list[Any]] = None,
        events_compaction_config: Optional[EventsCompactionConfig] = None,
        context_cache_config: Any = None,
        resumability_config: Optional[ResumabilityConfig] = None,
        **kwargs: Any,
    ):
        if root_agent is None:
            raise ValueError("App root_agent must be provided.")
        self.name = name
        self.root_agent = root_agent
        self.plugins = list(plugins or [])
        self.events_compaction_config = events_compaction_config
        self.context_cache_config = context_cache_config
        self.resumability_config = resumability_config
        for k, v in kwargs.items():
            setattr(self, k, v)


__all__ = ["App", "EventsCompactionConfig", "LlmEventSummarizer", "ResumabilityConfig"]
