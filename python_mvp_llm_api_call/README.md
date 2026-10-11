# Preflight Python MVP

One file, plain Anthropic API calls, no Mongo. Shows the core loop: plan scenarios, run a simulated environment against an agent, grade the trajectory, then rewrite the routine from the grade and check whether the agent does better on it.

## Run

```sh
cd python_mvp_llm_api_call
pip install -r requirements.txt           # anthropic, tqdm
# ANTHROPIC_API_KEY from your shell or ../.env

python preflight.py routine               # -> prints a routine id (rid), v1 of the default job
python preflight.py create <rid>          # -> prints a scenario id
python preflight.py simulate <sid>        # -> prints a trajectory id
python preflight.py judge <tid>           # -> prints a score
python preflight.py improve <tid>         # -> prints a new routine id (v2), rewritten from that judgment
python preflight.py simulate <sid> --routine <rid-v2>   # same scenario, new routine
```

Or all of that in one go, to see whether improving actually helps:

```sh
python preflight.py loop <rid> -n 2 --max-turns 8
```

`loop` plans `-n` scenarios, simulates and judges each on `<rid>`, improves the routine from the worst run, simulates and judges the same scenarios on the new version, and prints a before/after score table (also saved to `out/loops/`).

Defaults: job `car-dealership-email--morning-inbox-triage`, 1 scenario (`loop`: 2), the scenario's own turn cap (usually 20; `--max-turns 8` for a quicker test).

## Routines are files you can edit

`routine` copies a routine out of `environment_plus_routines/routines/` into `out/routines/<rid>.md`. From then on everything works from that copy: `create` plans against it, `simulate` puts it in the agent's system prompt, `judge` and `improve` read it to know the rules. Every command reads the file from disk when it runs, so you can edit `out/routines/<rid>.md` by hand between commands and the agent under test runs on whatever is there now.

`improve` never edits in place. It writes a new file with a new id, records `parent` and `changes` in the `.json` next to it, and saves a real `.diff` against the parent (trust the diff over the model's change notes), so a lineage v1 -> v2 -> v3 stays readable. Each trajectory and judgment records the routine id it ran on, and `judge`/`improve` grade against that version, not whichever the scenario was planned for.

## Output (`out/`, gitignored)

```
out/routines/<rid>.md                 the routine (line 1 points at its environment file), editable
out/routines/<rid>.json               job, version, parent, improver's change notes
out/routines/<rid>.diff               unified diff from the parent version (improve only)
out/scenarios/<sid>/scenario.md       what the planner wrote, readable
out/scenarios/<sid>/scenario.json     same, as data, plus the routine id it was planned for
out/trajectories/<tid>.md             the conversation, appended after every turn
out/trajectories/<tid>.jsonl          same, as data
out/trajectories/<tid>.json           scenario id, routine id, stop reason
out/judgments/<tid>.json              judge verdict: passed, score, severity, failed_rules, evidence_quote, reasoning
out/loops/<loop-id>.{txt,json}        before/after table from `loop`
```

## Who is who

Every role is a `Chat`: one Claude model, one system prompt, its own message history.

| Role | System prompt | Model |
|---|---|---|
| Agent under test | short preamble + environment `.md` + routine `.md` | `PREFLIGHT_MODEL` (default `claude-haiku-4-5-20251001`) |
| Planner | `agent/subagents/planner/instructions.md` | same |
| Simulator | `agent/subagents/simulator/instructions.md` + environment + scenario state | same |
| Judge | `agent/subagents/judge/instructions.md` | `PREFLIGHT_JUDGE_MODEL` (default `claude-haiku-4-5-20251001`) |
| Improver | `IMPROVE_PROMPT` in `preflight.py` | `PREFLIGHT_IMPROVE_MODEL` (default `claude-haiku-4-5-20251001`) |

The agent has no real tools; it writes tool calls as text and the simulator answers as the environment would. If the simulator's reply isn't parseable JSON, it is written into the trajectory and the run stops, so nothing is lost. The improver gets the routine, the scenario, the transcript and the verdict, and must return the whole routine between `<routine>` tags plus its edits between `<changes>` tags; it is told to make the smallest general fix and leave everything else word for word.
