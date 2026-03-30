# LOLO Gateway Router

This repo is being refactored toward a gateway/router role.

## Current shape
- `main` is a thin user-facing router.
- `main` exposes a single tool: `lolo_router_dispatch`.
- `lolo_router_dispatch` is the public boundary for routing user requests.
- lead-search requests still run through the embedded legacy backend:
  - `main -> crm -> sourcer -> qualifier -> commercial -> crm`

## Intentional boundary
- user/channel interaction lives in this repo
- strict business workflows should progressively move behind stable service/tool boundaries
- worker JSON contracts remain strict and internal

## Why this split
- keep OpenClaw good at channels, sessions, and routing
- keep deterministic business logic out of `main`
- make future extraction to an external lead engine easier without breaking the user-facing shell

## Current supported route
- `lead_workflow`
  - lead search
  - shortlist selection
  - query-memory reset

## Not supported yet
- calendar
- reminders
- generic productivity flows
- future engines not yet wired into `lolo_router_dispatch`
