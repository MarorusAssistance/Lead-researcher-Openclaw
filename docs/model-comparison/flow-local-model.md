# Local Model Flow

Date: 2026-03-30
Model profile: `lmstudio/qwen/qwen3-30b-a3b-2507`

## Active agent flow

The runtime architecture is the same regardless of provider:

1. `main`
   - receives user text
   - calls `prospecting_main_run`
   - returns only final short prose
2. `crm`
   - reads campaign state
   - writes accepted leads, rejected candidates, source traces, shortlist state
3. `sourcer`
   - gets one `SOURCE_ONE`
   - collects one named-person dossier
   - returns only `FOUND | NO_CANDIDATE | ERROR`
4. `crm`
   - stores source trace and search-run result
5. `qualifier`
   - decides `ACCEPT | REJECT | ENRICH`
   - can surface `closeMatch`
6. `commercial`
   - generates `outreachPack`
7. `crm`
   - persists final accepted lead, or pending shortlist option

## What each agent is actually doing in the local setup

### `main`
- Model choice barely matters here now.
- The real orchestration lives in `prospecting_main_run`.
- `main` is mostly a thin shell over the plugin workflow.

### `crm`
- Very low model dependence.
- The important behavior is schema validation and tool wiring, not free-form reasoning.

### `sourcer`
- This is the main bottleneck.
- In the current runtime it is `web_fetch`-only, so it relies on HTML search fallback and directory/profile pages more than normal web search.
- It is highly sensitive to:
  - prompt constraints
  - exclusions
  - visited URL memory
  - directory/profile evidence quality

### `qualifier`
- Mostly deterministic if the dossier is good.
- The main risk is upstream dossier quality, not classifier intelligence.

### `commercial`
- The local 30B can follow the structured contract and produce usable Spanish copy.
- It is slower than the cloud model, but the tone is often slightly warmer.

## Controlled tests run

### Test A: `sourcer`
Fixture: [source-one-spain-5-50.json](./source-one-spain-5-50.json)

Prompt intent:
- find one lead in Spain
- company size between 5 and 50
- respect exclusions and exploration hints

Observed result with local model:
- status: `FOUND`
- candidate: `Ignacio García Medina`
- company: `Unimedia Technology`
- evidence: Clutch profile with `10-49 employees`
- duration: about `53.9s`

Important failure:
- `Unimedia Technology` was already in `excludedCompanyNames`.
- So the local model produced a contract-valid JSON payload, but violated a hard business rule.

Interpretation:
- the local model is not the only problem here
- the workflow still depends too much on prompt obedience for exclusion handling

### Test B: `commercial`
Fixture: [commercial-unimedia.json](./commercial-unimedia.json)

Observed result with local model:
- status: `READY`
- duration: about `54.2s`
- contract: valid

Qualitative notes:
- copy is warmer and more natural in Spanish
- output is consistent with the instructed tone
- no fabricated claims
- all required fields were present

Sample observations:
- connect note was human and close to the desired tone
- DM felt reasonably natural
- email body matched the intended commercial framing

## Local-model assessment

### What works well
- `commercial` is viable on the local 30B
- JSON compliance is acceptable when the task is mostly generative and grounded in a fixed dossier
- the thin-`main` architecture reduces dependence on the `main` model

### What does not look solved by model size alone
- `sourcer` returning excluded or already explored companies
- repeated directory/profile reuse
- hard-rule obedience that still lives too much in prompt text instead of code guards

## Local-model conclusion

For this project as it exists today:
- local 30B is usable for `commercial`
- local 30B is not the decisive reason `sourcer` is failing
- the larger problem is that sourcing correctness still depends on prompt-following inside a chat-agent framework, instead of a tighter code-defined workflow
