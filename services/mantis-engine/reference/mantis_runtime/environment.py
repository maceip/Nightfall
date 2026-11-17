"""Execution environment interface used by the sandbox backends."""

from __future__ import annotations

import dataclasses
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from pathlib import Path


@dataclasses.dataclass
class ExecutionResult:
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False


class BaseEnvironment(ABC):
    """Run shell commands and move files inside a working directory."""

    _is_initialized: bool = False

    @property
    def is_initialized(self) -> bool:
        return self._is_initialized

    @is_initialized.setter
    def is_initialized(self, value: bool) -> None:
        self._is_initialized = value

    async def initialize(self) -> None:
        return None

    async def close(self) -> None:
        return None

    @property
    @abstractmethod
    def working_dir(self) -> Path: ...

    @abstractmethod
    async def execute(self, command: str, *, timeout: float | None = None) -> ExecutionResult: ...

    @abstractmethod
    async def read_file(self, path: Path) -> bytes: ...

    async def read_file_stream(self, path: Path) -> AsyncGenerator[bytes, None]:
        yield await self.read_file(path)

    @abstractmethod
    async def write_file(self, path: Path, content: str | bytes) -> None: ...


__all__ = ["BaseEnvironment", "ExecutionResult"]
