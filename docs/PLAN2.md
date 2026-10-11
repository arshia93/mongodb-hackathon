# Preflight plan 2: environments, routines and scenarios

This plan replaces the scenario model in [PLAN.md](PLAN.md) with the one in [environment_plus_routines/README.md](../environment_plus_routines/README.md). Everything not covered here stays as in PLAN.md.

## Context

Preflight tests an LLM agent (for example Grok Bot) on a routine, such as "triage the inbox," before it runs for real. The environment-and-routine README defines the vocabulary:

- **Environment:** the general rules of a system (its API, semantics, behavior). Not specific data.
- **State:** the specific details that fill in the environment, such as the events on a calendar.
- **Scenario:** environment plus state. This is what the Planner produces and the Simulator plays.
- **Routine:** the instructions the agent under test follows.

PLAN.md's `Scenario` (persona, goal, opening message) describes a chat test, not an environment plus state. This plan changes the data model to match the README.

## Decisions

- **D1:** An environment plus routine is one markdown file, `environment_plus_routines/contents/<environment>--<routine>.md`. It has an environment section and a routine section, in that order.
- **D2:** Each scenario is one (environment, state) pair. The state is written by the Planner. Each scenario also carries the criteria the Judge needs.
- **D3:** The Planner, Simulator and Judge are the same as in PLAN.md. Only their inputs and outputs change.
- **D4:** Fixing the agent is out of scope. Preflight reports problems and the team changes the routine prompt.
- **D5:** Push and pull mode are not decided here. They stay as in PLAN.md.

## Data model

Collections in Mongo (replacing `scenarios`, and adding two):

- `environments`: `_id`, `name` (kebab-case), `description`, `inputOutputFormat`, `dynamics`, `source` (the raw markdown file).
- `routines`: `_id`, `name`, `description`, `doList[]`, `doNotList[]`, `constraints[]`, `source`.
- `scenarios`: `_id`, `environmentId`, `routineId`, `category`, `state` (text), `judgeCriteria[]`, `createdAt`.
- `targets`, `runs`, `results`: unchanged in shape, but `results.scenarioId` now points at the new `scenarios`.

The zod schemas in `packages/core/src/schemas.ts` are the source of truth and get updated in one small PR, before the agent work starts.

## Architecture

Same as PLAN.md, with one addition: the QA system loads the environment-plus-routine file, the Planner turns it into scenarios, and the Simulator plays each one.

```
environment_plus_routines/contents/*.md
        │ parsed into environments + routines
        ▼
Planner ──> scenarios (environment + state + judgeCriteria) ──> Mongo
                                                               │
Simulator (plays the environment, produces tool outputs) <─────┘
        │ agent under test acts (push over HTTP, or pull over MCP)
        ▼
Judge (grades the trajectory using judgeCriteria) ──> results ──> Mongo ──> dashboard / MCP report
```

## Test categories

PLAN.md's eight categories stay as the planner's coverage checklist (`happy_path`, `edge_case`, `ambiguous_request`, `prompt_injection`, `policy_violation`, `tool_misuse`, `hallucination`, `persistence`). Each scenario gets one category.

## Build order

0. Spike: confirm how eve (or the plain SDK fallback) can call the Planner with an environment-plus-routine file.
1. `packages/core`: new `Environment`, `Routine` and `Scenario` zod schemas. Parser for the markdown file.
2. Seed: write the email example from the README as `contents/email-client--triage-inbox.md` and parse it.
3. Mongo helpers for environments, routines and scenarios.
4. Planner: reads a routine file, writes scenarios into Mongo.
5. Simulator and Judge, as in PLAN.md.
6. MCP tools and dashboard, as in PLAN.md, showing scenarios by environment.

## Verification

- **Parser:** the email example file parses into one environment and one routine, with every required section present. Missing sections fail loudly.
- **Schemas:** the seed scenarios validate against the new schemas.
- **Existing checks:** the MCP tools (`preflight_register_target`, `preflight_run_suite`, `preflight_get_report`) still pass the client test against Mongo.
- **Atlas:** seed and read back the environment and routine documents from the `preflight` database, then remove the test records.

## Open questions

- Does a target map to one routine, or can one target have several routines?
- Should the Judge criteria live on the scenario or be computed from the routine at run time?
- Does `preflight_register_target` now take a routine file path instead of a free-text spec?
