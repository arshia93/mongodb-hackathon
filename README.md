# Preflight

A QA agent you run before an agent goes live. Give it a spec of your agent; it writes test scenarios, plays the user over several turns, grades every transcript and returns a go/no-go scorecard. Also callable over MCP.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Who owns what: [docs/TEAM.md](docs/TEAM.md)

## Layout

```
agent/               eve agent: planner, simulator, judge          (Person 1)
packages/core/       shared zod schemas + Runner interface         (shared)
examples/refund-bot/ deliberately flawed demo target               (Person 2)
web/                 Next.js dashboard + MCP server at /api/mcp    (Person 3)
environment_plus_routines/    human written environments/ and the routines/ that run on them; read its readme for more details (shared)
```

## Setup

```
corepack enable && pnpm install
cp .env.example .env
```
