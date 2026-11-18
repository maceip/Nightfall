"""Session events: what a node, agent or tool emitted during an invocation."""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import types
from .models import LlmResponse


class EventCompaction(BaseModel):
    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    start_timestamp: float = 0.0
    end_timestamp: float = 0.0
    compacted_content: Optional[types.Content] = None


class EventActions(BaseModel):
    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    state_delta: dict[str, Any] = Field(default_factory=dict)
    route: Any = None
    end_of_agent: Optional[bool] = None
    agent_state: Optional[Any] = None
    escalate: Optional[bool] = None
    skip_summarization: Optional[bool] = None
    transfer_to_agent: Optional[str] = None
    compaction: Optional[EventCompaction] = None
    artifact_delta: dict[str, int] = Field(default_factory=dict)
    set_model_response: Any = None


class NodeInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    path: str = ""
    output_for: Optional[list[str]] = None
    message_as_output: Optional[bool] = None

    @property
    def name(self) -> str:
        seg = self.path.rsplit("/", 1)[-1] if self.path else ""
        return seg.split("@", 1)[0]

    @property
    def run_id(self) -> str:
        seg = self.path.rsplit("/", 1)[-1] if self.path else ""
        return seg.split("@", 1)[1] if "@" in seg else ""


class Event(LlmResponse):
    """An LlmResponse with authorship, actions and workflow placement."""

    invocation_id: str = ""
    author: str = ""
    actions: EventActions = Field(default_factory=EventActions)
    output: Any = None
    node_info: NodeInfo = Field(default_factory=NodeInfo)
    branch: Optional[str] = None
    long_running_tool_ids: Optional[set[str]] = None
    id: str = ""
    timestamp: float = Field(default_factory=time.time)

    @model_validator(mode="before")
    @classmethod
    def _convenience_kwargs(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if not ({"message", "state", "route", "node_path"} & data.keys()):
            return data
        data = dict(data)
        message = data.pop("message", None)
        state = data.pop("state", None)
        route = data.pop("route", None)
        node_path = data.pop("node_path", None)
        if message is not None:
            data["content"] = to_content(message)
        if state is not None or route is not None:
            actions = data.get("actions")
            if isinstance(actions, EventActions):
                actions = actions.model_dump()
            actions = dict(actions or {})
            if state is not None:
                actions["state_delta"] = state
            if route is not None:
                actions["route"] = route
            data["actions"] = actions
        if node_path is not None:
            info = data.get("node_info")
            if isinstance(info, NodeInfo):
                info = info.model_dump()
            info = dict(info or {})
            info["path"] = node_path
            data["node_info"] = info
        return data

    def model_post_init(self, __context: Any) -> None:
        if not self.id:
            self.id = Event.new_id()

    @property
    def message(self) -> Optional[types.Content]:
        return self.content

    @property
    def node_name(self) -> str:
        if self.actions.agent_state or self.actions.end_of_agent:
            return ""
        return self.node_info.name

    def is_final_response(self) -> bool:
        if self.actions.skip_summarization or self.long_running_tool_ids:
            return True
        if self.error_code and not self.partial and not self.get_function_calls():
            return True
        return (
            not self.get_function_calls()
            and not self.get_function_responses()
            and not self.partial
        )

    @staticmethod
    def new_id() -> str:
        return str(uuid.uuid4())


def to_content(value: Any, role: str = "user") -> types.Content:
    """Coerces a node input or output into a Content."""
    if isinstance(value, types.Content):
        return value
    if isinstance(value, types.Part):
        return types.Content(role=role, parts=[value])
    if isinstance(value, str):
        return types.Content(role=role, parts=[types.Part(text=value)])
    if isinstance(value, BaseModel):
        return types.Content(role=role, parts=[types.Part(text=value.model_dump_json())])
    if isinstance(value, (dict, list)):
        import json

        return types.Content(role=role, parts=[types.Part(text=json.dumps(value, default=str))])
    return types.Content(role=role, parts=[types.Part(text=str(value))])


__all__ = ["Event", "EventActions", "EventCompaction", "NodeInfo", "to_content"]
