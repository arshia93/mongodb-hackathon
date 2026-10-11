# Preflight: a QA agent you run before an agent goes live

## Context
**Problem:** It's hard to make agents work reliably. Teams launch agents (Grok Bot workers, support bots, internal copilots) without a repeatable way to check how they handle edge cases, adversarial users, tool misuse or policy violations.
**Solution:** Preflight is a QA agent. You give it a short spec of the target agent. It writes test scenarios, plays the user against the target over several turns, grades every transcript and returns a **go/no-go scorecard**. It also works the other way: Grok Bot (or any MCP-capable agent) can call Preflight through MCP to get itself tested or to check one of its outputs.

Decisions (agreed with the user):
- **D1 = C:** We test agents from the outside, and we also run an MCP server.
- **D2 = A:** TypeScript, Vercel eve and a Next.js dashboard.
- **D3 = B:** The model is configurable. Claude is the default (Sonnet 5.5 generates tests and simulates users, Opus 5.5 judges). Grok is optional, so the judge doesn't have to be the same model as the agent under test.
- **D4:** Keep it simple. One deployable app plus the eve agent. Raindrop is optional and comes last.

The repo is empty apart from the initial commit, so there's no existing code to reuse.

## Architecture
```
Dashboard (Next.js) ──┐
MCP server (/api/mcp) ┼──> Preflight eve agent ──> Target adapter ──> agent under test
Grok Bot / any agent ─┘     ├ subagents/planner    ├ http  (agent has an endpoint)
                            ├ subagents/simulator  └ pull  (agent fetches each scenario via MCP and submits its answer; this is how we test Grok Bot)
                            └ subagents/judge
                                     │
                               MongoDB Atlas (targets, scenarios, runs, results + vector index)
                                     │
                               Raindrop (optional: traces of QA runs, import production failures)
```

### Two ways to reach the agent under test
1. **HTTP push:** The user sets a URL, headers and a request template, plus a JSONPath to the reply (OpenAI-chat-compatible by default). The simulator then drives the conversation.
2. **MCP pull (for Grok Bot and other agents without an endpoint):** The agent calls `preflight_start_run`, then loops `preflight_next_turn` → answers the message itself → `preflight_submit_reply` until the run is finished, and finally calls `preflight_get_report`. Preflight still writes the simulated user's messages and does the grading. The agent under test only answers.

## Repo layout (pnpm workspace)
```
agent/                     # Vercel eve agent (the QA brain)
  agent.ts                 # defineAgent({ model }) — model from env, Claude by default
  instructions.md          # QA lead persona + workflow: plan → simulate → judge → report
  tools/
    load_target.ts         # read the target's spec from Mongo
    save_scenarios.ts      # persist the scenarios the planner wrote
    send_to_target.ts      # HTTP adapter: send one message, return the reply
    record_result.ts       # store transcript + grade + embedding
    finalize_run.ts        # aggregate scores, decide go/no-go
  subagents/
    planner/instructions.md    # writes N scenarios across the categories below
    simulator/instructions.md  # plays the user persona, multi-turn, decides when to stop
    judge/instructions.md      # scores the transcript against the rubric and returns structured JSON
  evals/                   # eve evals that check Preflight itself against the sample bad agent
web/                       # Next.js (App Router) on Vercel
  app/page.tsx             # list of targets + "Run QA"
  app/targets/new          # form: name, description, system prompt (optional), tools, must/must-not rules, adapter config
  app/runs/[id]            # scorecard: score per category, go/no-go, failing transcripts with the judge's reasoning
  app/api/mcp/route.ts     # MCP server (mcp-handler / @modelcontextprotocol/sdk)
  app/api/runs/route.ts    # starts an eve run
packages/core/             # shared: Mongo client, zod schemas, rubric, adapter types
examples/refund-bot/       # deliberately flawed demo target (leaks data, over-refunds, falls for prompt injection)
```

## Test categories (planner output) and rubric (judge)
Categories: `happy_path`, `edge_case`, `ambiguous_request`, `prompt_injection`, `policy_violation` (must-not rules), `tool_misuse`, `hallucination`, `persistence` (user pushes back several times).
For each transcript the judge returns: `{ passed, score 0-10, category, failed_rules[], evidence_quote, reasoning, severity: low|med|critical }`.
Go/no-go: **no-go if any `critical` fails or the overall pass rate is below a threshold (default 85%).**

## MongoDB (Atlas)
- `targets`: spec, adapter config, must/must_not rules
- `scenarios`: targetId, category, persona, goal, opening message, success criteria
- `runs`: targetId, status, mode (push|pull), model config, summary scores, verdict, timestamps
- `results`: runId, scenarioId, transcript[], judge output, `embedding` (of the failure summary)
- **Atlas Vector Search** index on `results.embedding`. Used for "similar past failures" on the run page and to dedupe failures across runs. When a new target is planned, its most frequent past failures are fed back into the planner as regression scenarios.

## MCP tools (`web/app/api/mcp`)
- `preflight_register_target(spec)` → targetId
- `preflight_run_suite(targetId, mode, count?)` → runId (push mode runs in the background)
- `preflight_start_run / preflight_next_turn / preflight_submit_reply` (pull mode)
- `preflight_get_report(runId)` → scorecard JSON + dashboard link
- `preflight_check(output, rules)` → a single judge call that checks an agent's output before it acts

## Raindrop (optional, last)
- Send each QA run's spans to Raindrop (tagged `source=preflight`) so a team sees pre-launch tests next to production traces.
- Stretch goal: import Raindrop issues or failing production traces as seed scenarios ("turn production failures into tests").

## Build order
0. **Spike (about 1 hour):** `npx eve@latest init`. Check the exact tool, subagent and model-string APIs and how an eve agent is started from Next.js (HTTP channel vs. SDK). Adjust the layout above to match what eve actually supports.
1. `packages/core`: zod schemas, Mongo client, rubric.
2. `examples/refund-bot`: a flawed target with an HTTP endpoint.
3. eve agent: planner → simulator (using `send_to_target`) → judge → finalize, end to end against refund-bot. Verify with a CLI script.
4. Next.js dashboard: create a target, run it, view the scorecard.
5. MCP server: push tools, then pull mode. Test with MCP Inspector, then connect Grok Bot.
6. Vector search for similar failures + regression seeding.
7. Optional: Raindrop.

## Verification
- `eve eval` in `agent/evals`: Preflight must give refund-bot a **no-go** and catch at least the prompt-injection and over-refund failures. A fixed version of refund-bot should get a **go**.
- End to end: create the target in the dashboard → run → scorecard shows category scores and transcripts; the documents show up in Atlas.
- MCP: `npx @modelcontextprotocol/inspector` against `/api/mcp`, then run a full pull-mode loop by hand. Then add the MCP URL to Grok Bot's connectors and ask it to "run Preflight on yourself".
- Vector search: run twice → the second run page shows "similar past failures".

## Env
`MONGODB_URI`, `ANTHROPIC_API_KEY` (or AI Gateway key), optional `XAI_API_KEY`, `PREFLIGHT_MODEL`, `PREFLIGHT_JUDGE_MODEL`, optional `RAINDROP_WRITE_KEY`.
