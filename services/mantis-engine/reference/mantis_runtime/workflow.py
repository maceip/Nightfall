"""Graph workflows: nodes joined by (optionally routed) edges.

A node is a Python function, an agent, or a ``BaseNode`` subclass. When a
node finishes, its output becomes the input of every successor whose edge
matches the route it emitted (unrouted edges always match; ``DEFAULT_ROUTE``
edges match when no specific route did). A node reached by several
unconditional edges from parallel branches can wait for all of them
(``_requires_all_predecessors``). Nodes that are ready at the same time run
concurrently.

Every event a node emits is stamped with the node's path
(``<workflow>@1/<node>@<run>``) and persisted by the runner before the node
continues, so an interrupted invocation can be resumed: nodes whose output
was already recorded are fast-forwarded instead of run again.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import random
from typing import Any, AsyncGenerator, Callable, Optional

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator

from .agents import BaseAgent, DeltaState, InvocationContext
from .events import Event, EventActions, to_content
from . import types

logger = logging.getLogger("mantis_runtime.workflow")

DEFAULT_ROUTE = "__DEFAULT__"


class WorkflowConfigurationError(Exception):
    pass


class WorkflowInvariantError(Exception):
    pass


class RetryConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_attempts: Optional[int] = 5
    initial_delay: Optional[float] = 1.0
    max_delay: Optional[float] = 60.0
    backoff_factor: Optional[float] = 2.0
    jitter: Optional[float] = 1.0
    exceptions: Optional[list[str]] = None

    @field_validator("exceptions", mode="before")
    @classmethod
    def _normalize(cls, v: Any) -> Any:
        if v is None:
            return None
        out = []
        for item in v:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, type) and issubclass(item, BaseException):
                out.append(item.__name__)
            else:
                raise WorkflowConfigurationError(f"exceptions must be names or classes, got {item!r}")
        return out


class NodeState(BaseModel):
    model_config = ConfigDict(extra="allow")

    attempt_count: int = 1
    run_id: str = ""
    status: str = "pending"


def _should_retry_node(exception: BaseException, retry_config: Optional[RetryConfig], node_state: NodeState) -> bool:
    """Default retry policy. Harness code may replace this module attribute."""
    if not retry_config or isinstance(exception, (WorkflowConfigurationError, WorkflowInvariantError)):
        return False
    max_attempts = retry_config.max_attempts if retry_config.max_attempts is not None else 5
    if node_state.attempt_count >= max_attempts:
        return False
    if retry_config.exceptions is not None:
        names = {cls.__name__ for cls in type(exception).__mro__ if cls is not object}
        if names.isdisjoint(retry_config.exceptions):
            return False
    return True


def _get_retry_delay(retry_config: RetryConfig, node_state: NodeState) -> float:
    initial = retry_config.initial_delay if retry_config.initial_delay is not None else 1.0
    factor = retry_config.backoff_factor if retry_config.backoff_factor is not None else 2.0
    max_delay = retry_config.max_delay if retry_config.max_delay is not None else 60.0
    delay = min(max_delay, initial * (factor ** max(0, node_state.attempt_count - 1)))
    jitter = retry_config.jitter or 0.0
    if jitter:
        delay = max(0.0, delay + random.uniform(-jitter, jitter) * delay)
    return delay


class Context:
    """What a node sees while it runs."""

    def __init__(self, invocation_context: InvocationContext, *, node_path: str, run_id: str,
                 attempt: int = 1, resume_inputs: Optional[dict[str, Any]] = None):
        self._invocation_context = invocation_context
        self.node_path = node_path
        self.run_id = run_id
        self.attempt_count = attempt
        self.resume_inputs = resume_inputs
        self.actions = EventActions()
        session = invocation_context.session
        self._state = DeltaState(getattr(session, "state", {}) if session is not None else {},
                                 self.actions.state_delta)
        self.output: Any = None
        self.route: Any = None
        self.error: Optional[BaseException] = None
        self.event_author = ""

    @property
    def state(self) -> DeltaState:
        return self._state

    @property
    def session(self) -> Any:
        return self._invocation_context.session

    @property
    def invocation_id(self) -> str:
        return self._invocation_context.invocation_id

    @property
    def user_content(self) -> Optional[types.Content]:
        return self._invocation_context.user_content

    @property
    def run_config(self) -> Any:
        return self._invocation_context.run_config

    def get_invocation_context(self) -> InvocationContext:
        return self._invocation_context


class BaseNode(BaseModel):
    """A unit of work in a workflow. Subclasses implement ``_run_impl``."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    name: str = ""
    retry_config: Optional[RetryConfig] = None
    rerun_on_resume: bool = False
    timeout: Optional[float] = None

    @property
    def _requires_all_predecessors(self) -> bool:
        return False

    async def _run_impl(self, *, ctx: Context, node_input: Any) -> AsyncGenerator[Any, None]:
        raise NotImplementedError
        yield  # pragma: no cover

    async def run(self, *, ctx: Context, node_input: Any) -> AsyncGenerator[Any, None]:
        async for item in self._run_impl(ctx=ctx, node_input=node_input):
            yield item

    def __hash__(self) -> int:
        return id(self)

    def __eq__(self, other: object) -> bool:
        return self is other


class _StartNode(BaseNode):
    pass


START = _StartNode(name="__START__")


class FunctionNode(BaseNode):
    """A node backed by a plain (sync or async, optionally generator) function."""

    func: Any = None
    _sig: Any = PrivateAttr(default=None)
    _func: Any = PrivateAttr(default=None)  # the wrapped function, for callers that unwrap a node

    def model_post_init(self, __context: Any) -> None:
        self._sig = inspect.signature(self.func)
        self._func = self.func

    @property
    def _unwrapped_func(self) -> Any:
        return self.func

    async def _run_impl(self, *, ctx: Context, node_input: Any) -> AsyncGenerator[Any, None]:
        kwargs: dict[str, Any] = {}
        for pname, param in self._sig.parameters.items():
            if pname == "ctx":
                kwargs["ctx"] = ctx
            elif pname == "node_input":
                kwargs["node_input"] = node_input
            elif param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
                continue
            elif pname in ctx.state:
                kwargs[pname] = ctx.state.get(pname)
            elif param.default is inspect.Parameter.empty:
                kwargs[pname] = None
        result = self.func(**kwargs)
        if inspect.isasyncgen(result):
            async for item in result:
                yield item
            return
        if inspect.isgenerator(result):
            for item in result:
                yield item
            return
        if inspect.isawaitable(result):
            result = await result
        if result is not None:
            yield result


class AgentNode(BaseNode):
    """Runs an agent as a node: its input becomes the agent's user turn."""

    agent: Any = None

    @property
    def _requires_all_predecessors(self) -> bool:
        return bool(getattr(self.agent, "_requires_all_predecessors", False))

    def __getattr__(self, item: str) -> Any:
        # The node stands in for its agent: agent attributes (instruction, tools,
        # model, callbacks) read through, as they would on the agent itself.
        try:
            return super().__getattr__(item)
        except AttributeError:
            agent = self.__dict__.get("agent")
            if agent is None or item.startswith("__"):
                raise
            return getattr(agent, item)

    async def _run_impl(self, *, ctx: Context, node_input: Any) -> AsyncGenerator[Any, None]:
        parent_ic = ctx.get_invocation_context()
        ic = parent_ic.model_copy(update={"agent": self.agent, "node_path": ctx.node_path, "_emit": None})
        injected: Optional[Event] = None
        session = parent_ic.session
        if node_input is not None and not ctx.resume_inputs:
            injected = Event(
                invocation_id=parent_ic.invocation_id,
                author="user",
                content=to_content(node_input, role="user"),
            )
            injected.content.role = "user"
            injected.node_info.path = ctx.node_path
            session.events.append(injected)
        try:
            async for ev in self.agent.run_async(ic):
                yield ev
        finally:
            if injected is not None:
                try:
                    session.events.remove(injected)
                except ValueError:
                    pass


def _is_agent(obj: Any) -> bool:
    return isinstance(obj, BaseAgent) or (
        hasattr(obj, "run_async") and hasattr(obj, "name") and not isinstance(obj, BaseNode)
    )


def node(node_like: Any = None, *, name: Optional[str] = None, retry_config: Optional[RetryConfig] = None,
         rerun_on_resume: Optional[bool] = None, timeout: Optional[float] = None, **_ignored: Any) -> Any:
    """Wraps a function or agent as a node, or overrides a node's properties."""
    if node_like is None:
        return lambda f: node(f, name=name, retry_config=retry_config, rerun_on_resume=rerun_on_resume,
                              timeout=timeout)
    if isinstance(node_like, BaseNode):
        update: dict[str, Any] = {}
        if name is not None:
            update["name"] = name
        if retry_config is not None:
            update["retry_config"] = retry_config
        if rerun_on_resume is not None:
            update["rerun_on_resume"] = rerun_on_resume
        if timeout is not None:
            update["timeout"] = timeout
        return node_like.model_copy(update=update) if update else node_like
    if _is_agent(node_like):
        return AgentNode(
            name=name or node_like.name, agent=node_like, retry_config=retry_config,
            rerun_on_resume=bool(rerun_on_resume), timeout=timeout,
        )
    if callable(node_like):
        return FunctionNode(
            name=name or getattr(node_like, "__name__", "node"), func=node_like, retry_config=retry_config,
            rerun_on_resume=bool(rerun_on_resume), timeout=timeout,
        )
    raise WorkflowConfigurationError(f"Cannot build a node from {node_like!r}")


class Edge(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    from_node: Any
    to_node: Any
    route: Any = None

    def model_post_init(self, __context: Any) -> None:
        if self.from_node == "START":
            self.from_node = START
        if not isinstance(self.from_node, BaseNode):
            self.from_node = node(self.from_node)
        if not isinstance(self.to_node, BaseNode):
            self.to_node = node(self.to_node)


class _Run:
    __slots__ = ("status", "output", "route", "run_id", "error")

    def __init__(self, run_id: str):
        self.status = "running"
        self.output: Any = None
        self.route: Any = None
        self.run_id = run_id
        self.error: Optional[BaseException] = None


class NodeFailedError(Exception):
    def __init__(self, error: BaseException, node_path: str):
        super().__init__(str(error))
        self.error = error
        self.node_path = node_path


class Workflow(BaseNode):
    """A graph of nodes. Run it through a ``Runner``."""

    edges: list[Any] = Field(default_factory=list)
    max_concurrency: Optional[int] = None
    description: str = ""
    sub_agents: list[Any] = Field(default_factory=list)
    _nodes: dict[str, BaseNode] = PrivateAttr(default_factory=dict)
    _out: dict[str, list[Edge]] = PrivateAttr(default_factory=dict)
    _preds: dict[str, set[str]] = PrivateAttr(default_factory=dict)
    _terminal: set[str] = PrivateAttr(default_factory=set)

    def model_post_init(self, __context: Any) -> None:
        edges: list[Edge] = []
        for e in self.edges:
            if isinstance(e, Edge):
                edges.append(e)
            elif isinstance(e, tuple):
                chain = [START if x == "START" else x for x in e]
                for a, b in zip(chain, chain[1:]):
                    edges.append(Edge(from_node=a, to_node=b))
            else:
                raise WorkflowConfigurationError(f"Unsupported edge item {e!r}")
        self.edges = edges
        nodes: dict[str, BaseNode] = {}
        for e in edges:
            for attr in ("from_node", "to_node"):
                n = getattr(e, attr)
                existing = nodes.get(n.name)
                if existing is not None and existing is not n:
                    # One agent named on several edges is wrapped once per edge; it is one node.
                    same_agent = getattr(existing, "agent", None) is not None and getattr(existing, "agent", None) is getattr(n, "agent", None)
                    if not same_agent:
                        raise WorkflowConfigurationError(f"Two different nodes are named {n.name!r}")
                    setattr(e, attr, existing)
                    continue
                nodes[n.name] = n
        self._nodes = nodes
        self._out = {}
        self._preds = {}
        for e in edges:
            self._out.setdefault(e.from_node.name, []).append(e)
            self._preds.setdefault(e.to_node.name, set()).add(e.from_node.name)
        self._terminal = {n for n in nodes if n != START.name and not self._out.get(n)}

    @property
    def graph_nodes(self) -> dict[str, BaseNode]:
        return dict(self._nodes)

    def _next_nodes(self, name: str, route: Any) -> list[str]:
        out: list[str] = []
        matched = False
        defaults: list[str] = []
        has_routing = False
        for e in self._out.get(name, []):
            if e.route is None:
                out.append(e.to_node.name)
                continue
            has_routing = True
            if e.route == DEFAULT_ROUTE:
                defaults.append(e.to_node.name)
                continue
            edge_routes = set(e.route) if isinstance(e.route, list) else {e.route}
            hit = bool(edge_routes & set(route)) if isinstance(route, list) else route in edge_routes
            if hit:
                out.append(e.to_node.name)
                matched = True
        if not matched:
            out.extend(defaults)
        if has_routing and not out:
            logger.warning("Node %r emitted route %r but no edge matched; the branch ends.", name, route)
        return out

    def _descendants(self, name: str) -> set[str]:
        seen: set[str] = set()
        stack = [name]
        while stack:
            cur = stack.pop()
            for e in self._out.get(cur, []):
                nxt = e.to_node.name
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return seen

    async def run_workflow(
        self,
        ic: InvocationContext,
        start_input: Any,
        *,
        emit: Callable[[Event], Any],
        recovered: Optional[dict[str, tuple[Any, Any]]] = None,
    ) -> Optional[NodeFailedError]:
        """Runs the graph to completion. Returns the failure, if any."""
        wf_path = f"{self.name}@1"
        recovered = recovered or {}
        triggers: dict[str, list[Any]] = {}
        counters: dict[str, int] = {}
        runs: dict[str, _Run] = {}
        join_arrivals: dict[str, set[str]] = {}
        pending: dict[str, asyncio.Task[tuple[str, _Run]]] = {}
        failure: Optional[NodeFailedError] = None

        def buffer_join(target: str) -> None:
            preds = self._preds.get(target, set())
            arrivals = join_arrivals.get(target, set())
            if not all(p == START.name or (p in arrivals and runs.get(p) and runs[p].status == "completed")
                       for p in preds):
                return
            if target in self._descendants(target):
                arrivals.difference_update(preds & self._descendants(target))
            else:
                join_arrivals.pop(target, None)
            outputs = {p: (start_input if p == START.name else runs[p].output) for p in preds}
            triggers.setdefault(target, []).append(outputs)

        def buffer_downstream(name: str, output: Any, route: Any) -> None:
            for target in self._next_nodes(name, route):
                tnode = self._nodes[target]
                if tnode._requires_all_predecessors:
                    join_arrivals.setdefault(target, set()).add(name)
                    buffer_join(target)
                else:
                    triggers.setdefault(target, []).append(output)

        for e in self._out.get(START.name, []):
            if e.to_node._requires_all_predecessors:
                buffer_join(e.to_node.name)
            else:
                triggers.setdefault(e.to_node.name, []).append(start_input)

        async def run_one(name: str, node_input: Any, run: _Run, node_path: str) -> tuple[str, _Run]:
            n = self._nodes[name]
            try:
                output, route = await self._run_node(n, ic, node_path, run.run_id, node_input, emit)
                run.output, run.route, run.status = output, route, "completed"
            except NodeFailedError as nf:
                run.status, run.error = "failed", nf
            return name, run

        try:
            while True:
                if ic.is_aborted:
                    break
                if failure is None:
                    for name in list(triggers.keys()):
                        if name in pending:
                            continue
                        if self.max_concurrency and self.max_concurrency > 0 and len(pending) >= self.max_concurrency:
                            break
                        queue = triggers.get(name) or []
                        if not queue:
                            triggers.pop(name, None)
                            continue
                        node_input = queue.pop(0)
                        if not queue:
                            triggers.pop(name, None)
                        counters[name] = counters.get(name, 0) + 1
                        run_id = str(counters[name])
                        node_path = f"{wf_path}/{name}@{run_id}"
                        run = _Run(run_id)
                        runs[name] = run
                        if node_path in recovered and not self._nodes[name].rerun_on_resume:
                            output, route = recovered[node_path]
                            run.output, run.route, run.status = output, route, "completed"
                            buffer_downstream(name, output, route)
                            continue
                        pending[name] = asyncio.create_task(run_one(name, node_input, run, node_path))
                    if any(triggers.values()) and not pending:
                        continue
                if not pending:
                    break
                done, _ = await asyncio.wait(list(pending.values()), return_when=asyncio.FIRST_COMPLETED)
                ordered = [t for t in pending.values() if t in done]
                for task in ordered:
                    name, run = task.result()
                    pending.pop(name, None)
                    if run.status == "failed":
                        if failure is None:
                            failure = run.error
                        continue
                    if failure is None:
                        buffer_downstream(name, run.output, run.route)
                if failure is not None and not pending:
                    break
        finally:
            for task in pending.values():
                task.cancel()
            if pending:
                await asyncio.gather(*pending.values(), return_exceptions=True)
        return failure

    async def _run_node(
        self, n: BaseNode, ic: InvocationContext, node_path: str, run_id: str, node_input: Any,
        emit: Callable[[Event], Any],
    ) -> tuple[Any, Any]:
        attempt = 1
        while True:
            ctx = Context(ic, node_path=node_path, run_id=run_id, attempt=attempt)
            output: Any = None
            route: Any = None
            try:
                async for item in n.run(ctx=ctx, node_input=node_input):
                    ev = item if isinstance(item, Event) else Event(output=item)
                    if not ev.invocation_id:
                        ev.invocation_id = ic.invocation_id
                    if not ev.author:
                        ev.author = n.name
                    if not ev.node_info.path:
                        ev.node_info.path = node_path
                    if ev.output is not None and not ev.partial:
                        output = ev.output
                    if ev.actions.route is not None:
                        route = ev.actions.route
                    await _call(emit, ev)
                if ctx.actions.state_delta or ctx.route is not None or ctx.output is not None:
                    if ctx.output is not None:
                        output = ctx.output
                    if ctx.route is not None:
                        route = ctx.route
                    flush = Event(invocation_id=ic.invocation_id, author=n.name, actions=ctx.actions,
                                  output=ctx.output)
                    if ctx.route is not None:
                        flush.actions.route = ctx.route
                    flush.node_info.path = node_path
                    await _call(emit, flush)
                if output is None:
                    # A completion record, so a resumed invocation knows this
                    # node finished even though it produced no output value.
                    marker = Event(invocation_id=ic.invocation_id, author=n.name,
                                   actions=EventActions(agent_state={"status": "completed"}))
                    if route is not None:
                        marker.actions.route = route
                    marker.node_info.path = node_path
                    await _call(emit, marker)
                return output, route
            except (asyncio.CancelledError, GeneratorExit):
                raise
            except Exception as err:
                status = getattr(err, "status", None)
                err_event = Event(
                    invocation_id=ic.invocation_id,
                    author=n.name,
                    error_code=status if isinstance(status, str) else type(err).__name__,
                    error_message=str(err),
                )
                err_event.node_info.path = node_path
                logger.debug("Node %s failed: %r", node_path, err)
                await _call(emit, err_event)
                import sys as _sys

                retry = _sys.modules[__name__]._should_retry_node(
                    err, n.retry_config, NodeState(attempt_count=attempt)
                )
                if not retry:
                    raise NodeFailedError(err, node_path) from err
                delay = _get_retry_delay(n.retry_config, NodeState(attempt_count=attempt))
                logger.warning("Node %s failed (%s); retrying in %.2fs", n.name, type(err).__name__, delay)
                await asyncio.sleep(delay)
                attempt += 1


async def _call(fn: Callable[[Event], Any], ev: Event) -> None:
    result = fn(ev)
    if inspect.isawaitable(result):
        await result


def recover_completed_nodes(events: list[Event], invocation_id: str) -> dict[str, tuple[Any, Any]]:
    """Node paths of an invocation that already finished, with output and route."""
    done: dict[str, tuple[Any, Any]] = {}
    for ev in events:
        if ev.invocation_id != invocation_id or not ev.node_info.path or ev.partial:
            continue
        path = ev.node_info.path
        if "/" not in path:
            continue
        state = ev.actions.agent_state
        completed_marker = isinstance(state, dict) and state.get("status") == "completed"
        if ev.output is not None or completed_marker:
            prev_route = done.get(path, (None, None))[1]
            done[path] = (ev.output if ev.output is not None else done.get(path, (None, None))[0],
                          ev.actions.route if ev.actions.route is not None else prev_route)
        if ev.error_code and path in done and ev.output is None and not completed_marker:
            done.pop(path, None)
    return done


__all__ = [
    "AgentNode",
    "BaseNode",
    "Context",
    "DEFAULT_ROUTE",
    "Edge",
    "FunctionNode",
    "NodeFailedError",
    "NodeState",
    "RetryConfig",
    "START",
    "Workflow",
    "WorkflowConfigurationError",
    "WorkflowInvariantError",
    "node",
    "recover_completed_nodes",
]
