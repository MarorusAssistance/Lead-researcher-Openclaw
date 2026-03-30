# Local vs Cloud Summary

Date: 2026-03-30

## What was compared

Two controlled worker-level comparisons were run with the same fixtures:

- local: `lmstudio/qwen/qwen3-30b-a3b-2507`
- cloud: `openai/gpt-4o-mini`

Fixtures:
- [source-one-spain-5-50.json](./source-one-spain-5-50.json)
- [commercial-unimedia.json](./commercial-unimedia.json)

Helper runner:
- [run-direct-agent.sh](./run-direct-agent.sh)

## Measured outcome

### `sourcer`
- local result: `FOUND` on excluded company `Unimedia Technology`
- cloud result: `FOUND` on excluded company `Unimedia Technology`
- local duration: about `53.9s`
- cloud duration: about `56.0s`

Meaning:
- both models made the same business-rule mistake
- this is not strong evidence that the local 30B is the main blocker

### `commercial`
- local result: valid `READY`
- cloud result: valid `READY`
- local duration: about `54.2s`
- cloud duration: about `17.7s`

Meaning:
- cloud was much faster
- local sounded slightly warmer in Spanish
- cloud was a bit stiffer but still usable

## Practical conclusion

### Short-term
- keep developing this repo so it works with the local model
- do not expect a cloud swap alone to fix sourcing
- if needed, use a cheap cloud model only for `commercial` or other draft-heavy steps

### Medium-term
- if the goal is a robust, deterministic, local-first multi-agent system, the next step should probably not be “more prompt patching inside OpenClaw”
- the next step should be moving the core workflow into a more code-defined orchestration stack

## Why this points to architecture more than raw model quality

OpenClaw’s official docs describe it as a gateway-centered multi-agent system with isolated workspaces and per-agent sessions, which fits personal assistants and routed chat agents well:
- OpenClaw multi-agent routing: `workspace`, `agentDir`, and per-agent `sessions` are first-class
- OpenClaw builds a custom system prompt for every run and manages context through compaction and pruning
- OpenClaw supports local providers, but provider integrations and prompt/runtime behavior still matter a lot

That is useful, but it means a lot of workflow correctness can still depend on:
- prompt obedience
- session behavior
- compaction/context behavior
- tool exposure and routing details

For a stricter local-first pipeline, official docs from other frameworks point to a better fit:
- LangGraph positions itself as a low-level orchestration framework for controllable agents with long-term memory and human-in-the-loop
- LangGraph explicitly supports lightweight local development and production-like validation as separate modes
- AutoGen Core positions itself as an event-driven, distributed, resilient framework with asynchronous messaging and local model support

## Recommendation

### For this OpenClaw repo
- keep it as the fastest way to iterate on prompts, tools, and cloud-capable workflows
- keep local-model support as a target
- prefer cloud only where it clearly pays off, such as outreach drafting latency

### For a new robust local-first project
- strongly consider a separate implementation in:
  - LangGraph, if you want explicit graph/state control in JS/TS or Python
  - AutoGen Core, if you want event-driven agents and explicit message-passing patterns

That separate project would let us:
- move exclusions, retries, shortlist handling, and trace memory into code-first control flow
- keep the local LLM behind narrower prompts
- reduce dependence on chat-session quirks
- benchmark local models more fairly

## Source notes

Official docs reviewed on 2026-03-30:
- OpenClaw Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
- OpenClaw System Prompt: https://docs.openclaw.ai/concepts/system-prompt
- OpenClaw Compaction: https://docs.openclaw.ai/concepts/compaction
- OpenClaw Ollama provider: https://docs.openclaw.ai/providers/ollama
- LangGraph overview: https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph.html
- LangGraph local development/testing: https://docs.langchain.com/langsmith/local-dev-testing
- AutoGen Core: https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/index.html
- AutoGen model guidance for local Ollama: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/models.html
