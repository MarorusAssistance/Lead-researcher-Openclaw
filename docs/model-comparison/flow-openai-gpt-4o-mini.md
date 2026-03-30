# Cloud Model Flow

Date: 2026-03-30
Model profile: `openai/gpt-4o-mini`

## Active agent flow

The architecture is unchanged:

1. `main`
2. `crm`
3. `sourcer`
4. `crm`
5. `qualifier`
6. `commercial`
7. `crm`

This file only describes what changed when the worker model was swapped from the local 30B to `gpt-4o-mini`.

## Controlled tests run

### Test A: `sourcer`
Fixture: [source-one-spain-5-50.json](/C:/Users/maror/Projects/Personal/Lead-researcher-Openclaw/docs/model-comparison/source-one-spain-5-50.json)

Observed result with `gpt-4o-mini`:
- status: `FOUND`
- candidate: `Ignacio García Medina`
- company: `Unimedia Technology`
- evidence: same Clutch profile, same core claims
- duration: about `56.0s`

Important failure:
- the cloud model made the same hard-rule mistake as the local model
- it also returned `Unimedia Technology`, even though that company was already excluded

Interpretation:
- switching to a cheap OpenAI model did not fix the sourcing bottleneck
- the failure appears to be structural:
  - prompt-led exclusion enforcement
  - repeated dependence on the same profile pages
  - insufficient code-side rejection before advancing the dossier

### Test B: `commercial`
Fixture: [commercial-unimedia.json](/C:/Users/maror/Projects/Personal/Lead-researcher-Openclaw/docs/model-comparison/commercial-unimedia.json)

Observed result with `gpt-4o-mini`:
- status: `READY`
- duration: about `17.7s`
- contract: valid

Qualitative notes:
- faster than the local 30B
- still grounded and contract-valid
- slightly stiffer and less natural in Spanish than the local output
- introduced one awkward phrasing: `Vi que dirigen Unimedia Technology`

## Cloud-model assessment

### What improved
- `commercial` latency improved a lot
- JSON compliance remained good

### What did not improve
- `sourcer` still failed in the same place
- the cloud model did not produce a more robust sourcing trajectory on the tested payload
- the failure pattern was effectively identical to the local model

## Cloud-model conclusion

For this project as it exists today:
- `gpt-4o-mini` is a good cheap fallback for draft generation
- `gpt-4o-mini` does not materially solve the sourcing correctness problem by itself
- moving the whole workflow to cloud would reduce some latency and probably raise average robustness a bit, but it would not remove the current architectural bottlenecks
