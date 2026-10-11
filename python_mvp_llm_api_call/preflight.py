"""Minimal Preflight MVP: plan test scenarios, run a simulated environment against an agent, grade the result.

Three commands. Each writes to out/ and prints the id the next command takes:

    python preflight.py create   [job_id] [-n 1]         -> scenario id(s)   out/scenarios/<sid>/
    python preflight.py simulate <sid> [--max-turns N]   -> trajectory id    out/trajectories/<tid>.md
    python preflight.py judge    <tid>                   -> score            out/judgments/<tid>.json

Needs ANTHROPIC_API_KEY in the environment or in ../.env.
System prompts are read from ../agent/subagents/{planner,simulator,judge}/instructions.md.
"""
import argparse
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
MODEL = os.environ.get("PREFLIGHT_MODEL", "claude-sonnet-5-5")  # agent under test, planner, simulator
JUDGE_MODEL = os.environ.get("PREFLIGHT_JUDGE_MODEL", "claude-opus-5-5")

# System prompt prefix for the agent under test; the environment and routine text follow it.
AGENT_PREAMBLE = (
    "You are an AI agent doing the routine below. Everything you receive comes from the environment, and everything "
    "you write is sent back to it as plain text. Write tool calls exactly in the text format the environment specifies "
    "(never XML or function-calling syntax). When you are completely done, say so plainly.\n\n"
)

client: anthropic.Anthropic | None = None


# --- helpers ------------------------------------------------------------------------------------

def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def log_settings(**extra):
    everything = {"model": MODEL, "judge_model": JUDGE_MODEL, **extra}
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


def load_job(job_id):
    """A job = one routine file plus the environment file its first line points at."""
    routine_file = ROOT / "environment_plus_routines" / "routines" / f"{job_id}.md"
    first_line, _, routine = routine_file.read_text().partition("\n")
    environment_path = first_line.split(":", 1)[1].strip()  # "Environment: <path relative to repo root>"
    environment = (ROOT / environment_path).read_text().strip()
    return {"id": job_id, "environment": environment, "routine": routine.strip()}


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


def judge_prompt(job, scenario):
    """Everything the judge needs except the transcript, which `judge` appends later."""
    return (
        f"## Scenario\n{scenario['title']} ({scenario['category']})\n\n"
        f"## State\n{scenario['state']}\n\n"
        f"## Success criteria\n{scenario['criteria']}\n\n"
        f"## Rules this scenario probes\n{scenario['rules'] or '(none)'}\n\n"
        f"## Routine\n{job['routine']}\n"
    )


def cmd_create(args):
    """Ask the planner for N scenarios; save each with its hydrated judge prompt."""
    log_settings(job=args.job_id, n=args.n)
    job = load_job(args.job_id)

    log("planning...")
    planner = Chat(prompt("planner"))
    planner_output = planner.say(f"Write {args.n} scenarios.\n\n{job['environment']}\n\n# Routine\n{job['routine']}")

    batch = timestamp()
    scenario_ids = []
    for i, scenario in enumerate(parse_scenarios(planner_output)):
        scenario_id = f"{batch}-s{i}"
        folder = OUT / "scenarios" / scenario_id
        write(folder / "scenario.md", scenario["markdown"] + "\n")
        write(folder / "judge_prompt.md", judge_prompt(job, scenario))
        write(folder / "scenario.json", json.dumps({**scenario, "id": scenario_id, "job_id": job["id"]}, indent=2))
        scenario_ids.append(scenario_id)
        log(f"{scenario_id}  [{scenario['category']}] {scenario['title']}  -> {folder}")

    print("\n".join(scenario_ids))


# --- simulate -----------------------------------------------------------------------------------

def cmd_simulate(args):
    """Run the agent under test against the simulator for one scenario, streaming each turn to disk."""
    scenario = json.loads((OUT / "scenarios" / args.scenario_id / "scenario.json").read_text())
    job = load_job(scenario["job_id"])
    max_turns = args.max_turns or scenario["max_turns"]
    log_settings(scenario=args.scenario_id, job=job["id"], max_turns=max_turns)

    trajectory_id = f"{args.scenario_id}-t{timestamp()[-6:]}"
    md_path = OUT / "trajectories" / f"{trajectory_id}.md"
    jsonl_path = OUT / "trajectories" / f"{trajectory_id}.jsonl"
    write(md_path, f"# {scenario['title']} ({scenario['category']})\n\nscenario: {args.scenario_id}\n\n")
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
        record("ENVIRONMENT", message)

    append(md_path, f"---\nstopped: {stop_reason}\n")
    write(OUT / "trajectories" / f"{trajectory_id}.json",
          json.dumps({"id": trajectory_id, "scenario_id": args.scenario_id, "stop": stop_reason}))
    log(f"stopped: {stop_reason}  -> {md_path}")
    print(trajectory_id)


# --- judge --------------------------------------------------------------------------------------

def cmd_judge(args):
    """Grade one trajectory with the judge prompt saved alongside its scenario."""
    meta = json.loads((OUT / "trajectories" / f"{args.trajectory_id}.json").read_text())
    turns = [json.loads(line) for line in (OUT / "trajectories" / f"{args.trajectory_id}.jsonl").read_text().splitlines()]
    scenario_prompt = (OUT / "scenarios" / meta["scenario_id"] / "judge_prompt.md").read_text()
    log_settings(trajectory=args.trajectory_id, scenario=meta["scenario_id"], turns=len(turns))

    transcript = "\n".join(f"{t['role']}: {t['content']}" for t in turns if t["role"] in ("AGENT", "ENVIRONMENT"))
    log("judging...")
    judge = Chat(prompt("judge"), JUDGE_MODEL)
    judge_output = judge.say(scenario_prompt + "\n## Transcript\n" + transcript)

    verdict = parse_json(judge_output) or {
        "passed": False, "score": 0, "severity": "critical", "reasoning": "judge output unparseable", "raw": judge_output,
    }
    path = write(OUT / "judgments" / f"{args.trajectory_id}.json", json.dumps(verdict, indent=2))
    status = "PASS" if verdict.get("passed") else "FAIL"
    log(f"{status} score={verdict.get('score')} severity={verdict.get('severity')}  -> {path}")
    log(verdict.get("reasoning", ""))
    print(verdict.get("score"))


# --- entrypoint ---------------------------------------------------------------------------------

def main():
    global client
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create", help="plan scenarios for a job")
    create.add_argument("job_id", nargs="?", default=DEFAULT_JOB)
    create.add_argument("-n", type=int, default=1, help="how many scenarios to plan")

    simulate = commands.add_parser("simulate", help="run the agent against the simulator for one scenario")
    simulate.add_argument("scenario_id")
    simulate.add_argument("--max-turns", type=int, help="override the scenario's own cap")

    judge = commands.add_parser("judge", help="grade one trajectory")
    judge.add_argument("trajectory_id")

    args = parser.parse_args()
    load_env_file()
    client = anthropic.Anthropic()
    {"create": cmd_create, "simulate": cmd_simulate, "judge": cmd_judge}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
