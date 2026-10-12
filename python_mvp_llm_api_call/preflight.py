"""Minimal Preflight MVP: plan test scenarios, run a simulated environment against an agent, grade the result,
then rewrite the routine so the agent does better next time.

Five commands. Each writes to out/ and prints the id the next command takes:

    python preflight.py routine  [job_id]                       -> routine id       out/routines/<rid>.md
    python preflight.py create   <rid> [-n 1]                   -> scenario id(s)   out/scenarios/<sid>/
    python preflight.py simulate <sid> [--routine RID] [--max-turns N]
                                                                -> trajectory id    out/trajectories/<tid>.md
    python preflight.py judge    <tid>                          -> score            out/judgments/<tid>.json
    python preflight.py improve  <tid>                          -> new routine id   out/routines/<rid>.md

and one that chains them to answer "does improving help?":

    python preflight.py loop     <rid> [-n 2] [--max-turns N]   -> before/after score table, new routine id

The routine file out/routines/<rid>.md is read from disk by every command, so you can edit it by hand between
commands and the agent under test runs on what is there now.

Needs ANTHROPIC_API_KEY in the environment or in ../.env.
System prompts are read from ../agent/subagents/{planner,simulator,judge}/instructions.md; the improver's lives in this file.
"""
import argparse
import difflib
import json
import os
import re
import sys
import time
from pathlib import Path

import anthropic
from tqdm import tqdm

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PROMPTS = ROOT / "agent" / "subagents"
OUT = HERE / "out"

DEFAULT_JOB = "car-dealership-email--morning-inbox-triage"
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MODEL = os.environ.get("PREFLIGHT_MODEL", DEFAULT_MODEL)  # agent under test, planner, simulator
JUDGE_MODEL = os.environ.get("PREFLIGHT_JUDGE_MODEL", DEFAULT_MODEL)
IMPROVE_MODEL = os.environ.get("PREFLIGHT_IMPROVE_MODEL", DEFAULT_MODEL)

# System prompt prefix for the agent under test; the environment and routine text follow it.
AGENT_PREAMBLE = (
    "You are an AI agent doing the routine below. Everything you receive comes from the environment, and everything "
    "you write is sent back to it as plain text. Write tool calls exactly in the text format the environment specifies "
    "(never XML or function-calling syntax). When you are completely done, say so plainly.\n\n"
)

# System prompt for the improver, which rewrites a routine after a judge has graded one run of it.
IMPROVE_PROMPT = """\
You revise the written routine that an AI agent follows. A judge has just graded one test run of the agent on this \
routine, and you are given the routine, the scenario it was tested on, the full transcript, and the judge's verdict.

The agent sees nothing but the environment description and the routine text, so the routine's wording is the only \
lever you have. Your job is to change the routine so that an agent reading it would not fail the way this one did, \
while still doing everything else the routine asks.

## How to revise

- The agent never sees the scenario, its state, the success criteria, the transcript or the verdict; those are \
for you. It sees only the environment description and the routine. Never refer to any of them in the routine \
("the state", "the inbox section of this routine", "the scenario") and never tell the agent to skip a tool call \
because the answer is already written down somewhere.
- Start from the judge's `failed_rules`, `evidence_quote` and `reasoning`, and find the moment in the transcript \
where the agent went wrong. Ask what in the routine let that happen: a missing rule, an ambiguous or conflicting \
one, a procedure step the agent skipped because it was not spelled out, or an example that pointed the wrong way.
- The simulated environment is itself imperfect. If the transcript shows it returning data the state says does not \
exist, or ignoring a correct tool call, that is a simulator fault, not the routine's. Do not add rules to work \
around it.
- Fix the cause with the smallest change that would hold up: sharpen a sentence, add a rule, add a step to the \
procedure, or add a short example. Prefer editing an existing rule over adding a new one that overlaps it.
- Keep rules general. Do not mention names, email addresses, stock numbers, dates or other specifics from this one \
scenario; write the rule so it covers the whole class of situation.
- Keep the routine's structure, headings and voice exactly as they are. Leave every section you are not fixing \
untouched, word for word. Do not reformat, reorder or shorten unaffected text.
- Do not invent tools, change what an existing tool does, or add anything the environment cannot support.
- Do not make the routine longer than it needs to be; an agent follows a tight routine better than a bloated one.
- If the run passed cleanly, or the failure was the agent's or the simulator's and nothing in the routine \
contributed to it, return the routine unchanged and say so.
- Your output is diffed against the original line by line. Any line you did not mean to change must come back \
byte for byte: same words, same punctuation, same pronouns.

## Output

Return the complete revised routine between <routine> and </routine> tags, exactly as it should be saved (it must \
start with the `# Routine` heading). Then, between <changes> and </changes> tags, list each edit as one bullet: \
what you changed and which failure it addresses. Nothing else.
"""

client: anthropic.Anthropic | None = None


# --- helpers ------------------------------------------------------------------------------------

def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def log_settings(**extra):
    everything = {"model": MODEL, "judge_model": JUDGE_MODEL, "improve_model": IMPROVE_MODEL, **extra}
    log("settings: " + ", ".join(f"{k}={v}" for k, v in everything.items()))


def timestamp():
    return time.strftime("%Y%m%d-%H%M%S")


def load_env_file():
    """Populate ANTHROPIC_API_KEY (and friends) from ../.env if not already set."""
    env_file = ROOT / ".env"
    if "ANTHROPIC_API_KEY" in os.environ or not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


def split_routine_file(text):
    """A routine file is 'Environment: <path relative to repo root>' on line one, then the routine markdown."""
    first_line, _, routine = text.partition("\n")
    environment_path = first_line.split(":", 1)[1].strip()
    return environment_path, routine.strip()


def save_routine(routine, environment_path, job_id, parent=None, changes=None):
    """Store a routine version under out/routines/ and return its new id."""
    version = 1 if parent is None else routine_meta(parent)["version"] + 1
    routine_id = f"r{timestamp()}-v{version}"
    write(OUT / "routines" / f"{routine_id}.md", f"Environment: {environment_path}\n\n{routine}\n")
    write(OUT / "routines" / f"{routine_id}.json", json.dumps({
        "id": routine_id, "job_id": job_id, "version": version, "parent": parent,
        "environment": environment_path, "changes": changes,
    }, indent=2))
    return routine_id


def routine_meta(routine_id):
    return json.loads((OUT / "routines" / f"{routine_id}.json").read_text())


def load_routine(routine_id):
    """A stored routine plus the environment file its first line points at. Everything downstream works from this."""
    meta = routine_meta(routine_id)
    environment_path, routine = split_routine_file((OUT / "routines" / f"{routine_id}.md").read_text())
    environment = (ROOT / environment_path).read_text().strip()
    return {"id": routine_id, "job_id": meta["job_id"], "environment_path": environment_path,
            "environment": environment, "routine": routine}


def prompt(role):
    return (PROMPTS / role / "instructions.md").read_text()


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def append(path, text):
    with path.open("a") as f:
        f.write(text)


def parse_json(text):
    """Return the first JSON object found anywhere in text, or None."""
    for match in re.finditer(r"\{", text):
        try:
            return json.JSONDecoder().raw_decode(text[match.start():])[0]
        except json.JSONDecodeError:
            continue
    return None


class Chat:
    """One model with a fixed system prompt and a growing message history."""

    def __init__(self, system, model=MODEL):
        self.system = system
        self.model = model
        self.history = []

    def say(self, text):
        self.history.append({"role": "user", "content": text})
        response = client.messages.create(model=self.model, max_tokens=8000, system=self.system, messages=self.history)
        reply = "".join(block.text for block in response.content if block.type == "text")
        self.history.append({"role": "assistant", "content": reply})
        return reply


# --- routine ------------------------------------------------------------------------------------

def cmd_routine(args):
    """Copy a routine from environment_plus_routines/ into out/routines/ as version 1 and print its id."""
    source = ROOT / "environment_plus_routines" / "routines" / f"{args.job_id}.md"
    environment_path, routine = split_routine_file(source.read_text())
    routine_id = save_routine(routine, environment_path, args.job_id)
    log(f"{routine_id}  v1 of {args.job_id}  -> {OUT / 'routines' / routine_id}.md")
    print(routine_id)


# --- create -------------------------------------------------------------------------------------

def parse_scenarios(planner_output):
    """Split the planner's markdown into scenario dicts. One scenario per '# Title' block."""
    text = re.sub(r"^```[a-z]*\n|```\s*$", "", planner_output.strip(), flags=re.M)
    for block in re.split(r"^(?=# )", text, flags=re.M):
        if not block.strip():
            continue
        sections = {
            heading.strip().lower(): body.strip()
            for heading, body in re.findall(r"^## (.+?)\n(.*?)(?=^## |\Z)", block, re.S | re.M)
        }
        category = re.search(r"^- Category:\s*(\S+)", block, re.M)
        max_turns = re.search(r"^- Max turns:\s*(\d+)", block, re.M)
        yield {
            "title": block.splitlines()[0].lstrip("# ").strip(),
            "category": category.group(1) if category else "unknown",
            "max_turns": int(max_turns.group(1)) if max_turns else 20,
            "state": sections.get("state", ""),
            "first_input": sections.get("first input", ""),
            "criteria": sections.get("success criteria", ""),
            "rules": sections.get("rules probed", ""),
            "markdown": block.strip(),
        }


def scenario_brief(scenario):
    """The scenario as the judge and improver see it: title, state, criteria, rules probed."""
    return (
        f"## Scenario\n{scenario['title']} ({scenario['category']})\n\n"
        f"## State\n{scenario['state']}\n\n"
        f"## Success criteria\n{scenario['criteria']}\n\n"
        f"## Rules this scenario probes\n{scenario['rules'] or '(none)'}\n"
    )


def load_scenario(scenario_id):
    return json.loads((OUT / "scenarios" / scenario_id / "scenario.json").read_text())


def do_create(routine_id, n):
    """Ask the planner for N scenarios against one stored routine; return the new scenario ids."""
    job = load_routine(routine_id)
    log("planning...")
    planner = Chat(prompt("planner"))
    planner_output = planner.say(f"Write {n} scenarios.\n\n{job['environment']}\n\n{job['routine']}")

    batch = timestamp()
    scenario_ids = []
    for i, scenario in enumerate(parse_scenarios(planner_output)):
        scenario_id = f"{batch}-s{i}"
        folder = OUT / "scenarios" / scenario_id
        write(folder / "scenario.md", scenario["markdown"] + "\n")
        write(folder / "scenario.json", json.dumps(
            {**scenario, "id": scenario_id, "routine_id": job["id"], "job_id": job["job_id"]}, indent=2))
        scenario_ids.append(scenario_id)
        log(f"{scenario_id}  [{scenario['category']}] {scenario['title']}  -> {folder}")
    return scenario_ids


def cmd_create(args):
    log_settings(routine=args.routine_id, n=args.n)
    print("\n".join(do_create(args.routine_id, args.n)))


# --- simulate -----------------------------------------------------------------------------------

def do_simulate(scenario_id, routine_id=None, max_turns=None):
    """Run the agent under test against the simulator for one scenario, streaming each turn to disk.

    The agent runs on `routine_id` if given, else on the routine the scenario was planned for. Either way the
    routine file is read from disk now, so hand edits to out/routines/<rid>.md take effect immediately.
    """
    scenario = load_scenario(scenario_id)
    job = load_routine(routine_id or scenario["routine_id"])
    max_turns = max_turns or scenario["max_turns"]
    log(f"simulate {scenario_id} on {job['id']} (max_turns={max_turns})")

    trajectory_id = f"{scenario_id}-t{timestamp()[-6:]}"
    md_path = OUT / "trajectories" / f"{trajectory_id}.md"
    jsonl_path = OUT / "trajectories" / f"{trajectory_id}.jsonl"
    write(md_path, f"# {scenario['title']} ({scenario['category']})\n\nscenario: {scenario_id}\nroutine: {job['id']}\n\n")
    write(jsonl_path, "")

    def record(role, content):
        # Written before the next model call, so a crash still leaves a readable partial trajectory.
        append(md_path, f"### {role}\n\n{content.strip()}\n\n")
        append(jsonl_path, json.dumps({"role": role, "content": content}) + "\n")

    agent = Chat(AGENT_PREAMBLE + job["environment"] + "\n\n" + job["routine"])
    simulator = Chat(prompt("simulator") + f"\n\n## Environment\n{job['environment']}\n\n## State\n{scenario['state']}")

    message = scenario["first_input"]
    stop_reason = "out_of_turns"
    record("ENVIRONMENT", message)
    for step in tqdm(range(1, max_turns + 1), desc="turns", unit="turn"):
        reply = agent.say(message)
        record("AGENT", reply)

        simulator_output = simulator.say(f"The agent has taken {step} of {max_turns} allowed steps.\n\nAGENT: {reply}")
        turn = parse_json(simulator_output)  # expected: {"done": false, "input": "..."} or {"done": true, "stopReason": "..."}
        if turn is None:
            record("SIMULATOR (unparseable, stopping)", simulator_output)
            stop_reason = "simulator_unparseable"
            break
        if turn.get("done"):
            stop_reason = turn.get("stopReason", "routine_finished")
            break

        message = turn["input"]
        if not isinstance(message, str):  # simulator occasionally returns a list/object of tool results
            message = json.dumps(message, indent=2)
        record("ENVIRONMENT", message)

    append(md_path, f"---\nstopped: {stop_reason}\n")
    write(OUT / "trajectories" / f"{trajectory_id}.json",
          json.dumps({"id": trajectory_id, "scenario_id": scenario_id, "routine_id": job["id"], "stop": stop_reason}))
    log(f"stopped: {stop_reason}  -> {md_path}")
    return trajectory_id


def cmd_simulate(args):
    log_settings(scenario=args.scenario_id, routine=args.routine or "(scenario's own)", max_turns=args.max_turns or "(scenario's own)")
    print(do_simulate(args.scenario_id, args.routine, args.max_turns))


# --- judge --------------------------------------------------------------------------------------

def load_trajectory(trajectory_id):
    """Return (meta, turns, transcript) for one trajectory; the transcript is the AGENT/ENVIRONMENT turns as text."""
    meta = json.loads((OUT / "trajectories" / f"{trajectory_id}.json").read_text())
    turns = [json.loads(line) for line in (OUT / "trajectories" / f"{trajectory_id}.jsonl").read_text().splitlines()]
    transcript = "\n".join(f"{t['role']}: {t['content']}" for t in turns if t["role"] in ("AGENT", "ENVIRONMENT"))
    return meta, turns, transcript


def do_judge(trajectory_id):
    """Grade one trajectory against the scenario it ran and the routine version the agent actually ran on."""
    meta, turns, transcript = load_trajectory(trajectory_id)
    scenario = load_scenario(meta["scenario_id"])
    job = load_routine(meta["routine_id"])
    log(f"judge {trajectory_id} ({len(turns)} turns) against {job['id']}")

    judge = Chat(prompt("judge"), JUDGE_MODEL)
    judge_output = judge.say(scenario_brief(scenario) + f"\n## Routine\n{job['routine']}\n\n## Transcript\n{transcript}")

    verdict = parse_json(judge_output) or {
        "passed": False, "score": 0, "severity": "critical", "reasoning": "judge output unparseable", "raw": judge_output,
    }
    verdict = {**verdict, "trajectory_id": trajectory_id, "scenario_id": scenario["id"], "routine_id": job["id"]}
    path = write(OUT / "judgments" / f"{trajectory_id}.json", json.dumps(verdict, indent=2))
    status = "PASS" if verdict.get("passed") else "FAIL"
    log(f"{status} score={verdict.get('score')} severity={verdict.get('severity')}  -> {path}")
    log(verdict.get("reasoning", ""))
    return verdict


def cmd_judge(args):
    log_settings(trajectory=args.trajectory_id)
    print(do_judge(args.trajectory_id).get("score"))


# --- improve ------------------------------------------------------------------------------------

def tagged(text, tag):
    """Return the content of the first <tag>...</tag> block in text, or None."""
    match = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.S)
    return match.group(1).strip() if match else None


def do_improve(trajectory_id):
    """Rewrite the routine a judged trajectory ran on so the agent would not fail that way again; return the new id."""
    verdict = json.loads((OUT / "judgments" / f"{trajectory_id}.json").read_text())
    meta, turns, transcript = load_trajectory(trajectory_id)
    scenario = load_scenario(meta["scenario_id"])
    job = load_routine(meta["routine_id"])
    log(f"improve {job['id']} from {trajectory_id} (passed={verdict.get('passed')}, score={verdict.get('score')})")

    improver = Chat(IMPROVE_PROMPT, IMPROVE_MODEL)
    improver_output = improver.say(
        f"## Routine\n{job['routine']}\n\n" + scenario_brief(scenario) +
        f"\n## Transcript\n{transcript}\n\n## Judge verdict\n{json.dumps(verdict, indent=2)}\n"
    )

    routine = tagged(improver_output, "routine")
    if not routine:
        path = write(OUT / "routines" / f"failed-{timestamp()}.txt", improver_output)
        sys.exit(f"improver returned no <routine> block; raw output saved to {path}")
    if not routine.startswith("# Routine"):
        routine = "# Routine\n" + routine
    changes = tagged(improver_output, "changes") or "(no change notes returned)"

    routine_id = save_routine(routine, job["environment_path"], job["job_id"], parent=job["id"], changes=changes)
    diff = "".join(difflib.unified_diff(
        (job["routine"] + "\n").splitlines(keepends=True), (routine + "\n").splitlines(keepends=True),
        fromfile=f"{job['id']}.md", tofile=f"{routine_id}.md", n=1,
    ))
    write(OUT / "routines" / f"{routine_id}.diff", diff or "(identical)\n")
    log(f"{routine_id}  v{routine_meta(routine_id)['version']} of {job['job_id']}, from {job['id']}  "
        f"-> {OUT / 'routines' / routine_id}.md")
    log("changes:\n" + changes)
    log("diff:\n" + (diff or "(identical)"))
    return routine_id


def cmd_improve(args):
    log_settings(trajectory=args.trajectory_id)
    print(do_improve(args.trajectory_id))


# --- loop ---------------------------------------------------------------------------------------

def cmd_loop(args):
    """Does the improver actually help? Plan scenarios, run and grade them on the routine, improve the routine from the
    worst run, then run and grade the same scenarios on the new version and print both score columns."""
    log_settings(routine=args.routine_id, n=args.n, max_turns=args.max_turns or "(scenario's own)")

    def run_all(routine_id):
        verdicts = []
        for scenario_id in scenario_ids:
            verdicts.append(do_judge(do_simulate(scenario_id, routine_id, args.max_turns)))
        return verdicts

    scenario_ids = do_create(args.routine_id, args.n)
    before = run_all(args.routine_id)
    worst = min(before, key=lambda v: v.get("score") or 0)
    new_routine_id = do_improve(worst["trajectory_id"])
    after = run_all(new_routine_id)

    def cell(v):
        return f"{v.get('score')} {'PASS' if v.get('passed') else 'FAIL'}"

    def mean(verdicts):
        return sum(v.get("score") or 0 for v in verdicts) / len(verdicts)

    lines = [f"{'scenario':<34}{args.routine_id:<24}{new_routine_id}"]
    for scenario_id, b, a in zip(scenario_ids, before, after):
        lines.append(f"{scenario_id:<34}{cell(b):<24}{cell(a)}")
    lines.append(f"{'mean':<34}{mean(before):<24.1f}{mean(after):.1f}")
    table = "\n".join(lines)

    loop_id = f"loop-{timestamp()}"
    write(OUT / "loops" / f"{loop_id}.json", json.dumps({
        "id": loop_id, "routine_before": args.routine_id, "routine_after": new_routine_id, "improved_from": worst["trajectory_id"],
        "scenarios": scenario_ids, "before": before, "after": after, "mean_before": mean(before), "mean_after": mean(after),
    }, indent=2))
    write(OUT / "loops" / f"{loop_id}.txt", table + "\n")
    log(f"-> {OUT / 'loops' / loop_id}.json")
    print(table)
    print(new_routine_id)


# --- entrypoint ---------------------------------------------------------------------------------

def main():
    global client

    class HelpFormatter(argparse.RawDescriptionHelpFormatter, argparse.ArgumentDefaultsHelpFormatter):
        pass

    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=f"models: {MODEL} (agent, planner, simulator), {JUDGE_MODEL} (judge), {IMPROVE_MODEL} (improver); "
               "override with PREFLIGHT_MODEL / PREFLIGHT_JUDGE_MODEL / PREFLIGHT_IMPROVE_MODEL",
        formatter_class=HelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True)

    routine = commands.add_parser("routine", help="add a routine: copy it into out/routines/ as version 1",
                                  formatter_class=HelpFormatter)
    routine.add_argument("job_id", nargs="?", default=DEFAULT_JOB,
                         help="routine file name without .md (see environment_plus_routines/routines/)")

    create = commands.add_parser("create", help="plan scenarios for a stored routine", formatter_class=HelpFormatter)
    create.add_argument("routine_id", help="id printed by routine or improve")
    create.add_argument("-n", type=int, default=1, help="how many scenarios to plan")

    simulate = commands.add_parser("simulate", help="run the agent against the simulator for one scenario",
                                   formatter_class=HelpFormatter)
    simulate.add_argument("scenario_id", help="id printed by create")
    simulate.add_argument("--routine", metavar="RID", help="run on this routine version instead of the scenario's own")
    simulate.add_argument("--max-turns", type=int, help="override the scenario's own cap")

    judge = commands.add_parser("judge", help="grade one trajectory", formatter_class=HelpFormatter)
    judge.add_argument("trajectory_id", help="id printed by simulate")

    improve = commands.add_parser("improve", help="rewrite a routine from one judgment into a new version",
                                  formatter_class=HelpFormatter)
    improve.add_argument("trajectory_id", help="id printed by simulate, after judge has graded it")

    loop = commands.add_parser("loop", help="create, simulate+judge, improve, simulate+judge again; print before/after",
                               formatter_class=HelpFormatter)
    loop.add_argument("routine_id", help="id printed by routine or improve")
    loop.add_argument("-n", type=int, default=2, help="how many scenarios to plan")
    loop.add_argument("--max-turns", type=int, help="override every scenario's own cap")

    args = parser.parse_args()
    load_env_file()
    client = anthropic.Anthropic()
    {"routine": cmd_routine, "create": cmd_create, "simulate": cmd_simulate, "judge": cmd_judge,
     "improve": cmd_improve, "loop": cmd_loop}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
