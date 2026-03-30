# TOOLS

Use only the active router tool.

Rules:
- call `lolo_router_dispatch { userText }` exactly once
- do not call worker tools
- do not call session tools
- do not call planner sub-tools
- after the tool returns, answer with `userMessage` exactly
