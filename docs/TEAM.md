# Team split

Three people, three areas that follow the architecture in [PLAN.md](PLAN.md). The only shared code is `packages/core`.

## First 45 minutes, all together: agree on the shared contract

Merge this to `main` before splitting up, and branch from there:

- **Zod schemas in `packages/core`:** `Target`, `Scenario`, `Run`, `Result`, `JudgeOutput`, adapter config. They match the Mongo collections and the judge's JSON.
- **One interface everyone calls** (`packages/core/src/runner.ts`): `startRun(targetId, mode) → runId` and `stepRun(runId, reply?)`. The dashboard and the MCP server call it; the agent implements it. Until the agent is ready, a stub that returns fake results keeps the other two moving.
- **Shared setup:** one Atlas cluster, one `.env.example`, the pnpm workspace.

## Owners

### Person 1: Agent brain (`agent/`)
- Step 0, the eve spike (`npx eve@latest init`). Biggest unknown, so it starts right away.
- Planner, simulator and judge subagent instructions, plus the tools: `load_target`, `send_to_target`, `record_result`, `finalize_run`.
- Go/no-go logic and the `eve eval` checks against refund-bot.
- A function that runs one turn on its own (Person 3 needs it for pull mode).

### Person 2: Data and the demo target (`packages/core`, `examples/refund-bot`, Mongo)
- Mongo client and read/write helpers for each collection.
- refund-bot: a deliberately flawed HTTP target, plus a fixed version that should pass. Person 1 needs it early, so build it right after the contract.
- Atlas Vector Search: embeddings, the "similar past failures" query, and feeding past failures back to the planner as regression scenarios.
- Seed data so Person 3 can build the UI before real runs exist.
- Raindrop, if there's time.

### Person 3: Product surface (`web/`)
- Next.js dashboard: target list, new-target form, scorecard page for each run.
- MCP server at `/api/mcp`: push tools first, then pull mode (`start_run` / `next_turn` / `submit_reply` / `get_report`).
- `preflight_check` (a single judge call).
- Test with MCP Inspector, then connect Grok Bot.
- Vercel deploys.

## Checkpoints

1. **~2h:** the agent runs end to end against refund-bot from a CLI script and writes results to Mongo. Most important milestone.
2. **~4h:** the dashboard starts a real run and shows a real scorecard. Push MCP tools work in MCP Inspector.
3. **~6h:** the pull-mode loop works with Grok Bot. The second run shows similar past failures.
4. **Final stretch:** stop building features and rehearse the demo: refund-bot gets a no-go, the fixed version gets a go, then Grok Bot runs "Preflight on yourself".

## Risks

- **The eve spike can block everyone.** If eve's API is unclear after about an hour, Person 1 falls back to plain Anthropic SDK calls behind the same `startRun` interface.
- **Pull mode involves two people:** Person 1's one-turn function and Person 3's MCP tools. Keep the state between turns in Mongo on the `runs` document, not in memory, because Vercel serverless functions don't keep memory between calls.
- **Merge conflicts:** only `packages/core` is shared. Change it in small PRs that land quickly; otherwise stay in your own folder.
