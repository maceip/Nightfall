"""Session stores: in memory, or durable in SQLite (WAL, configurable busy wait)."""

from __future__ import annotations

import copy
import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from .events import Event

_TEMP_PREFIX = "temp:"


class Session(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    id: str
    app_name: str
    user_id: str
    state: dict[str, Any] = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)
    last_update_time: float = 0.0


class ListSessionsResponse(BaseModel):
    sessions: list[Session] = Field(default_factory=list)


def _apply_delta(state: dict[str, Any], delta: dict[str, Any]) -> None:
    for k, v in (delta or {}).items():
        state[k] = v


def _json_fallback(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=str)
    return str(value)


def _persistable(state: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in state.items() if not str(k).startswith(_TEMP_PREFIX)}


class BaseSessionService:
    async def create_session(self, *, app_name: str, user_id: str, state: Optional[dict[str, Any]] = None,
                             session_id: Optional[str] = None) -> Session:
        raise NotImplementedError

    async def get_session(self, *, app_name: str, user_id: str, session_id: str,
                          config: Any = None) -> Optional[Session]:
        raise NotImplementedError

    async def list_sessions(self, *, app_name: str, user_id: Optional[str] = None) -> ListSessionsResponse:
        raise NotImplementedError

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        raise NotImplementedError

    async def append_event(self, session: Session, event: Event) -> Event:
        if event.partial:
            return event
        _apply_delta(session.state, event.actions.state_delta)
        session.events.append(event)
        session.last_update_time = event.timestamp
        return event

    async def close(self) -> None:
        return None


class InMemorySessionService(BaseSessionService):
    def __init__(self) -> None:
        self._sessions: dict[tuple[str, str, str], Session] = {}

    async def create_session(self, *, app_name: str, user_id: str, state: Optional[dict[str, Any]] = None,
                             session_id: Optional[str] = None) -> Session:
        sid = (session_id or "").strip() or str(uuid.uuid4())
        key = (app_name, user_id, sid)
        if key in self._sessions:
            raise ValueError(f"Session {sid!r} already exists")
        session = Session(id=sid, app_name=app_name, user_id=user_id, state=copy.deepcopy(state or {}),
                          last_update_time=time.time())
        self._sessions[key] = session
        return session.model_copy(deep=True)

    async def get_session(self, *, app_name: str, user_id: str, session_id: str,
                          config: Any = None) -> Optional[Session]:
        session = self._sessions.get((app_name, user_id, session_id))
        return session.model_copy(deep=True) if session is not None else None

    async def list_sessions(self, *, app_name: str, user_id: Optional[str] = None) -> ListSessionsResponse:
        return ListSessionsResponse(sessions=[
            s.model_copy(update={"events": []}) for (a, u, _), s in self._sessions.items()
            if a == app_name and (user_id is None or u == user_id)
        ])

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        self._sessions.pop((app_name, user_id, session_id), None)

    async def append_event(self, session: Session, event: Event) -> Event:
        await super().append_event(session, event)
        stored = self._sessions.get((session.app_name, session.user_id, session.id))
        if stored is not None and not event.partial:
            _apply_delta(stored.state, event.actions.state_delta)
            stored.events.append(event.model_copy(deep=True))
            stored.last_update_time = event.timestamp
        return event


_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '{}',
    create_time REAL NOT NULL,
    update_time REAL NOT NULL,
    PRIMARY KEY (app_name, user_id, id)
);
CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL DEFAULT '',
    timestamp REAL NOT NULL,
    event_data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_session ON events (app_name, user_id, session_id, seq);
"""


class SqliteSessionService(BaseSessionService):
    """Durable sessions in one SQLite file, safe for concurrent campaigns."""

    def __init__(self, db_path: str, *, timeout: Optional[float] = None) -> None:
        self.db_path = db_path
        self.timeout = float(timeout) if timeout is not None else 5.0
        self._lock = threading.RLock()
        self._schema_ready = False

    def _connect(self) -> sqlite3.Connection:
        directory = os.path.dirname(os.path.abspath(self.db_path))
        if directory and not os.path.isdir(directory):
            os.makedirs(directory, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=self._busy_timeout())
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
        except sqlite3.DatabaseError:
            pass
        if not self._schema_ready:
            with self._lock:
                if not self._schema_ready:
                    conn.executescript(_SCHEMA)
                    self._schema_ready = True
        return conn

    def _busy_timeout(self) -> float:
        return max(5.0, self.timeout)

    async def create_session(self, *, app_name: str, user_id: str, state: Optional[dict[str, Any]] = None,
                             session_id: Optional[str] = None) -> Session:
        sid = (session_id or "").strip() or str(uuid.uuid4())
        now = time.time()
        st = copy.deepcopy(state or {})
        conn = self._connect()
        try:
            with conn:
                exists = conn.execute(
                    "SELECT 1 FROM sessions WHERE app_name=? AND user_id=? AND id=?", (app_name, user_id, sid)
                ).fetchone()
                if exists:
                    raise ValueError(f"Session {sid!r} already exists")
                conn.execute(
                    "INSERT INTO sessions (app_name, user_id, id, state, create_time, update_time) VALUES (?,?,?,?,?,?)",
                    (app_name, user_id, sid, json.dumps(_persistable(st), default=str), now, now),
                )
        finally:
            conn.close()
        return Session(id=sid, app_name=app_name, user_id=user_id, state=st, last_update_time=now)

    async def get_session(self, *, app_name: str, user_id: str, session_id: str,
                          config: Any = None) -> Optional[Session]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT state, update_time FROM sessions WHERE app_name=? AND user_id=? AND id=?",
                (app_name, user_id, session_id),
            ).fetchone()
            if row is None:
                return None
            rows = conn.execute(
                "SELECT event_data FROM events WHERE app_name=? AND user_id=? AND session_id=? ORDER BY seq",
                (app_name, user_id, session_id),
            ).fetchall()
        finally:
            conn.close()
        events: list[Event] = []
        for r in rows:
            try:
                events.append(Event.model_validate_json(r["event_data"]))
            except Exception:
                continue
        num_recent = getattr(config, "num_recent_events", None) if config is not None else None
        if num_recent:
            events = events[-int(num_recent):]
        try:
            state = json.loads(row["state"] or "{}")
        except json.JSONDecodeError:
            state = {}
        return Session(id=session_id, app_name=app_name, user_id=user_id, state=state, events=events,
                       last_update_time=row["update_time"])

    async def list_sessions(self, *, app_name: str, user_id: Optional[str] = None) -> ListSessionsResponse:
        conn = self._connect()
        try:
            if user_id is None:
                rows = conn.execute("SELECT * FROM sessions WHERE app_name=?", (app_name,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM sessions WHERE app_name=? AND user_id=?",
                                    (app_name, user_id)).fetchall()
        finally:
            conn.close()
        return ListSessionsResponse(sessions=[
            Session(id=r["id"], app_name=r["app_name"], user_id=r["user_id"],
                    state=json.loads(r["state"] or "{}"), last_update_time=r["update_time"])
            for r in rows
        ])

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        conn = self._connect()
        try:
            with conn:
                conn.execute("DELETE FROM events WHERE app_name=? AND user_id=? AND session_id=?",
                             (app_name, user_id, session_id))
                conn.execute("DELETE FROM sessions WHERE app_name=? AND user_id=? AND id=?",
                             (app_name, user_id, session_id))
        finally:
            conn.close()

    async def append_event(self, session: Session, event: Event) -> Event:
        if event.partial:
            return event
        await super().append_event(session, event)
        data = event.model_dump_json(exclude_none=True, fallback=_json_fallback)
        conn = self._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO events (id, app_name, user_id, session_id, invocation_id, timestamp, event_data) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (event.id, session.app_name, session.user_id, session.id, event.invocation_id or "",
                     event.timestamp, data),
                )
                if event.actions.state_delta:
                    conn.execute(
                        "UPDATE sessions SET state=?, update_time=? WHERE app_name=? AND user_id=? AND id=?",
                        (json.dumps(_persistable(session.state), default=str), event.timestamp,
                         session.app_name, session.user_id, session.id),
                    )
                else:
                    conn.execute(
                        "UPDATE sessions SET update_time=? WHERE app_name=? AND user_id=? AND id=?",
                        (event.timestamp, session.app_name, session.user_id, session.id),
                    )
        finally:
            conn.close()
        return event


__all__ = [
    "BaseSessionService",
    "InMemorySessionService",
    "ListSessionsResponse",
    "Session",
    "SqliteSessionService",
]
