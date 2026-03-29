# TOOLS

Use only the active workflow tool.

Rules:
- call `prospecting_main_run { userText }` exactly once
- do not call worker tools
- do not call session tools
- do not call planner sub-tools
- after the tool returns, answer with `userMessage` exactly
