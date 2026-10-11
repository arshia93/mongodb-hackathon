# Preflight Python MVP

One file, plain Anthropic API calls, no Mongo. Shows the core loop: plan scenarios, run a simulated environment against an agent, grade the trajectory.

## Run

```sh
cd python_mvp_llm_api_call
pip install -r requirements.txt           # anthropic, tqdm
# ANTHROPIC_API_KEY from your shell or ../.env

python preflight.py create                # -> prints a scenario id
python preflight.py simulate <sid>        # -> prints a trajectory id
python preflight.py judge <tid>           # -> prints a score
```

Defaults: job `car-dealership-email--morning-inbox-triage`, 1 scenario, the scenario's own turn cap (usually 20; `--max-turns 10` for a quicker test).

## Output (`out/`, gitignored)

```
out/scenarios/<sid>/scenario.md       what the planner wrote, readable
out/scenarios/<sid>/judge_prompt.md   hydrated judge input (state, criteria, rules, routine), minus the transcript
out/scenarios/<sid>/scenario.json     same, as data
out/trajectories/<tid>.md             the conversation, appended after every turn
out/trajectories/<tid>.jsonl          same, as data
out/judgments/<tid>.json              judge verdict: passed, score, severity, failed_rules, evidence_quote, reasoning
```

## Who is who

Every role is a `Chat`: one Claude model, one system prompt, its own message history.

| Role | System prompt | Model |
|---|---|---|
| Agent under test | short preamble + environment `.md` + routine `.md` | `PREFLIGHT_MODEL` (default `claude-haiku-4-5-20251001`) |
| Planner | `agent/subagents/planner/instructions.md` | same |
| Simulator | `agent/subagents/simulator/instructions.md` + environment + scenario state | same |
| Judge | `agent/subagents/judge/instructions.md` | `PREFLIGHT_JUDGE_MODEL` (default `claude-haiku-4-5-20251001`) |

The agent has no real tools; it writes tool calls as text and the simulator answers as the environment would. If the simulator's reply isn't parseable JSON, it is written into the trajectory and the run stops, so nothing is lost.
