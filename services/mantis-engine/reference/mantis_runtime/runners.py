"""The runner: drives one invocation of an app against a session."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, AsyncGenerator, Optional

from . import types
from .agents import InvocationContext, RunConfig
from .apps import App
from .events import Event, EventActions
from .sessions import BaseSessionService, InMemorySessionService
from .workflow import Workflow, recover_completed_nodes

logger = logging.getLogger("mantis_runtime.runners")

_DONE = object()


class Runner:
    """Runs an app (a workflow or an agent) and streams its events.

    Every non-partial event is appended to the session before the node that
    emitted it continues, so a session always reflects what has happened and
    an interrupted invocation can be resumed by passing its ``invocation_id``.
    A node that fails after its retries surfaces twice: as an error event in
    the stream, then as its exception once the stream ends.
    """

    def __init__(
        self,
        *,
        app: Optional[App] = None,
        app_name: Optional[str] = None,
        agent: Any = None,
        session_service: Optional[BaseSessionService] = None,
        **_kwargs: Any,
    ):
        if app is None:
            if agent is None:
                raise ValueError("Runner needs an app or an agent")
            app = App(name=app_name or getattr(agent, "name", "app"), root_agent=agent)
        self.app = app
        self.app_name = app_name or app.name
        self.agent = app.root_agent
        self.session_service = session_service or InMemorySessionService()

    async def close(self) -> None:
        closer = getattr(self.session_service, "close", None)
        if closer is not None:
            await closer()

    async def run_async(
        self,
        *,
        user_id: str,
        session_id: str,
        new_message: Optional[types.Content] = None,
        invocation_id: Optional[str] = None,
        run_config: Optional[RunConfig] = None,
        state_delta: Optional[dict[str, Any]] = None,
        **_kwargs: Any,
    ) -> AsyncGenerator[Event, None]:
        session = await self.session_service.get_session(
            app_name=self.app_name, user_id=user_id, session_id=session_id
        )
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        run_config = run_config or RunConfig()
        resuming = bool(invocation_id) and any(e.invocation_id == invocation_id for e in session.events)
        inv_id = invocation_id or f"e-{uuid.uuid4()}"

        start_input: Any = None
        if new_message is not None:
            if any(p.function_call for p in new_message.parts or []):
                raise ValueError("User message cannot contain function calls.")
            user_event = Event(invocation_id=inv_id, author="user", content=new_message)
            if state_delta:
                user_event.actions.state_delta.update(state_delta)
            await self.session_service.append_event(session, user_event)
            start_input = new_message
        elif resuming:
            for ev in session.events:
                if ev.invocation_id == inv_id and ev.author == "user" and not ev.node_info.path and ev.content:
                    start_input = ev.content
                    break

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()

        async def emit(ev: Event) -> None:
            if not ev.invocation_id:
                ev.invocation_id = inv_id
            fut = loop.create_future()
            await queue.put((ev, fut))
            await fut

        root = self.agent
        ic = InvocationContext(
            invocation_id=inv_id,
            session=session,
            agent=root,
            run_config=run_config,
            session_service=self.session_service,
            user_content=start_input if isinstance(start_input, types.Content) else None,
            emit=emit,
            app=self.app,
        )

        async def drive() -> None:
            try:
                if isinstance(root, Workflow):
                    recovered = recover_completed_nodes(session.events, inv_id) if resuming else {}
                    failure = await root.run_workflow(ic, start_input, emit=emit, recovered=recovered)
                    if failure is not None:
                        raise failure.error
                    await emit(Event(invocation_id=inv_id, author=root.name,
                                     actions=EventActions(end_of_agent=True)))
                else:
                    async for ev in root.run_async(ic):
                        await emit(ev)
            finally:
                await queue.put(_DONE)

        task = asyncio.create_task(drive())
        try:
            while True:
                item = await queue.get()
                if item is _DONE:
                    break
                ev, fut = item
                if not ev.partial:
                    await self.session_service.append_event(session, ev)
                try:
                    yield ev
                finally:
                    if not fut.done():
                        fut.set_result(None)
        finally:
            if not task.done():
                ic.is_aborted = True
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        exc = task.exception() if task.done() and not task.cancelled() else None
        if exc is not None:
            raise exc
        await self._maybe_compact(session)

    async def _maybe_compact(self, session: Any) -> None:
        cfg = getattr(self.app, "events_compaction_config", None)
        if cfg is None or cfg.summarizer is None or not cfg.token_threshold:
            return
        last_prompt = 0
        for ev in reversed(session.events):
            usage = ev.usage_metadata
            if usage is not None and usage.prompt_token_count:
                last_prompt = usage.prompt_token_count
                break
        if last_prompt < cfg.token_threshold:
            return
        retain = int(cfg.event_retention_size or 0)
        candidates = [e for e in session.events if not (e.actions and e.actions.compaction)]
        to_compact = candidates[:-retain] if retain else candidates
        if not to_compact:
            return
        try:
            summary = await cfg.summarizer.maybe_summarize_events(events=to_compact)
        except Exception as err:  # compaction is an optimisation, never a failure
            logger.warning("Session compaction failed: %s", err)
            return
        if summary is not None:
            summary.invocation_id = summary.invocation_id or (to_compact[-1].invocation_id or "")
            await self.session_service.append_event(session, summary)


class InMemoryRunner(Runner):
    def __init__(self, agent: Any = None, *, app_name: Optional[str] = None, app: Optional[App] = None, **kwargs: Any):
        super().__init__(app=app, app_name=app_name, agent=agent, session_service=InMemorySessionService(), **kwargs)


__all__ = ["InMemoryRunner", "Runner"]
