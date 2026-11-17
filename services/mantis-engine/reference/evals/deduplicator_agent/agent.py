# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
from pathlib import Path
from mantis_runtime.agents import Agent
from mantis_runtime.lite_llm import LiteLlm

from core.config import get_llm_kwargs, ResilientLiteLlm

LiteLlm = ResilientLiteLlm
from tools import TOOLS

def build_deduplicator_agent():
    eval_model = os.environ.get('EVAL_MODEL', 'vertex_ai/gemini-3.5-flash-lite')
    eval_effort = os.environ.get('EVAL_REASONING_EFFORT', 'low')

    _, llm_kwargs = get_llm_kwargs(
        model_id=eval_model,
        reasoning_effort=eval_effort,
    )

    skill_path = Path(__file__).resolve().parent.parent.parent / 'mantis-dedupe'
    tools_list = [TOOLS[t] for t in ['read_file', 'write_file', 'get_findings', 'dedupe_findings'] if t in TOOLS]

    if skill_path.is_dir() and (skill_path / 'SKILL.md').exists():
        skill_text = (skill_path / 'SKILL.md').read_text(encoding='utf-8')
        agent_tools = tools_list
        instruction = (
            "You are the 'deduplicator' stage in the Mantis vulnerability review pipeline.\n"
            "Follow the skill below using your available tools.\n"
            "Retrieve findings using get_findings, analyze duplicates, and merge duplicate findings using dedupe_findings.\n\n"
            + skill_text
        )
    else:
        agent_tools = tools_list
        instruction = (
            "You are the 'deduplicator' stage in the Mantis vulnerability review pipeline.\n"
            "Retrieve findings using get_findings, analyze duplicates, and merge duplicate findings using dedupe_findings."
        )

    return Agent(
        name='deduplicator',
        model=LiteLlm(**llm_kwargs),
        instruction=instruction,
        tools=agent_tools,
    )

async def get_agent_async():
    return build_deduplicator_agent()

def get_agent():
    return build_deduplicator_agent()

root_agent = build_deduplicator_agent()
