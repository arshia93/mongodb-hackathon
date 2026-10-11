"""Minimal Preflight MVP. Three commands, each writes to out/ and prints the id the next one needs.

    python preflight.py create   [job_id] [-n 1]        -> scenario ids     out/scenarios/<sid>/
    python preflight.py simulate <sid> [--max-turns 20]  -> trajectory id    out/trajectories/<tid>.md
    python preflight.py judge    <tid>                   -> score            out/judgments/<tid>.json

ANTHROPIC_API_KEY from the env or ../.env. Prompts come from ../agent/subagents/*/instructions.md.
"""
import argparse, json, os, re, sys, time
from pathlib import Path
import anthropic
from tqdm import tqdm

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PROMPTS = ROOT / "agent" / "subagents"
OUT = HERE / "out"
DEFAULT_JOB = "car-dealership-email--morning-inbox-triage"
MODEL = os.environ.get("PREFLIGHT_MODEL", "claude-sonnet-5-5")
JUDGE_MODEL = os.environ.get("PREFLIGHT_JUDGE_MODEL", "claude-opus-5-5")
AGENT_PREAMBLE = (
    "You are an AI agent doing the routine below. Everything you receive comes from the environment, and everything "
    "you write is sent back to it as plain text. Write tool calls exactly in the text format the environment specifies "
    "(never XML or function-calling syntax). When you are completely done, say so plainly.\n\n")

client = None
now = lambda: time.strftime("%Y%m%d-%H%M%S")
log = lambda s: print(f"[{time.strftime('%H:%M:%S')}] {s}", flush=True)


def settings(**kw):
    log("settings: " + ", ".join(f"{k}={v}" for k, v in {"model": MODEL, "judge_model": JUDGE_MODEL, **kw}.items()))


def load_env_file():
    f = ROOT / ".env"
    if "ANTHROPIC_API_KEY" not in os.environ and f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def load_job(job_id):
    first, _, routine = (ROOT / "environment_plus_routines" / "routines" / f"{job_id}.md").read_text().partition("\n")
    env = (ROOT / first.split(":", 1)[1].strip()).read_text().strip()
    return {"id": job_id, "environment": env, "routine": routine.strip()}


class Chat:
    """One model with a system prompt and memory. say() appends and returns the reply text."""

    def __init__(self, system, model=MODEL):
        self.system, self.model, self.history = system, model, []

    def say(self, text):
        self.history.append({"role": "user", "content": text})
        r = client.messages.create(model=self.model, max_tokens=8000, system=self.system, messages=self.history)
        reply = "".join(b.text for b in r.content if b.type == "text")
        self.history.append({"role": "assistant", "content": reply})
        return reply


def parse_json(text):
    """First JSON object anywhere in the text, or None."""
    for m in re.finditer(r"\{", text):
        try:
            return json.JSONDecoder().raw_decode(text[m.start():])[0]
        except json.JSONDecodeError:
            continue
    return None


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


# --- create ------------------------------------------------------------------------------------
def parse_scenarios(raw):
    raw = re.sub(r"^```[a-z]*\n|```\s*$", "", raw.strip(), flags=re.M)
    for block in re.split(r"^(?=# )", raw, flags=re.M):
        if not block.strip():
            continue
        sec = {k.strip().lower(): v.strip() for k, v in re.findall(r"^## (.+?)\n(.*?)(?=^## |\Z)", block, re.S | re.M)}
        cat = re.search(r"^- Category:\s*(\S+)", block, re.M)
        turns = re.search(r"^- Max turns:\s*(\d+)", block, re.M)
        yield {"title": block.splitlines()[0].lstrip("# ").strip(), "category": cat.group(1) if cat else "unknown",
               "max_turns": int(turns.group(1)) if turns else 20, "state": sec.get("state", ""),
               "first_input": sec.get("first input", ""), "criteria": sec.get("success criteria", ""),
               "rules": sec.get("rules probed", ""), "markdown": block.strip()}


def judge_prompt(job, s):
    return (f"## Scenario\n{s['title']} ({s['category']})\n\n## State\n{s['state']}\n\n## Success criteria\n{s['criteria']}\n\n"
            f"## Rules this scenario probes\n{s['rules'] or '(none)'}\n\n## Routine\n{job['routine']}\n")


def cmd_create(a):
    settings(job=a.job_id, n=a.n)
    job = load_job(a.job_id)
    log("planning...")
    raw = Chat((PROMPTS / "planner" / "instructions.md").read_text()).say(
        f"Write {a.n} scenarios.\n\n{job['environment']}\n\n# Routine\n{job['routine']}")
    stamp, ids = now(), []
    for i, s in enumerate(parse_scenarios(raw)):
        sid = f"{stamp}-s{i}"
        d = OUT / "scenarios" / sid
        write(d / "scenario.md", s["markdown"] + "\n")
        write(d / "judge_prompt.md", judge_prompt(job, s))
        write(d / "scenario.json", json.dumps({**s, "id": sid, "job_id": job["id"]}, indent=2))
        ids.append(sid)
        log(f"{sid}  [{s['category']}] {s['title']}  -> {d}")
    print("\n".join(ids))


# --- simulate ----------------------------------------------------------------------------------
def cmd_simulate(a):
    s = json.loads((OUT / "scenarios" / a.scenario_id / "scenario.json").read_text())
    job = load_job(s["job_id"])
    max_turns = a.max_turns or s["max_turns"]
    settings(scenario=a.scenario_id, job=job["id"], max_turns=max_turns)
    tid = f"{a.scenario_id}-t{now()[-6:]}"
    md, jl = OUT / "trajectories" / f"{tid}.md", OUT / "trajectories" / f"{tid}.jsonl"
    write(md, f"# {s['title']} ({s['category']})\n\nscenario: {a.scenario_id}\n\n")
    write(jl, "")

    def turn(role, content):  # streaming: every turn hits disk before the next model call
        md.open("a").write(f"### {role}\n\n{content.strip()}\n\n")
        jl.open("a").write(json.dumps({"role": role, "content": content}) + "\n")

    agent = Chat(AGENT_PREAMBLE + job["environment"] + "\n\n" + job["routine"])
    sim = Chat((PROMPTS / "simulator" / "instructions.md").read_text()
               + f"\n\n## Environment\n{job['environment']}\n\n## State\n{s['state']}")
    msg, stop = s["first_input"], "out_of_turns"
    turn("ENVIRONMENT", msg)
    for step in tqdm(range(1, max_turns + 1), desc="turns", unit="turn"):
        reply = agent.say(msg)
        turn("AGENT", reply)
        raw = sim.say(f"The agent has taken {step} of {max_turns} allowed steps.\n\nAGENT: {reply}")
        out = parse_json(raw)
        if out is None:
            turn("SIMULATOR (unparseable, stopping)", raw)
            stop = "simulator_unparseable"
            break
        if out.get("done"):
            stop = out.get("stopReason", "routine_finished")
            break
        msg = out["input"]
        turn("ENVIRONMENT", msg)
    md.open("a").write(f"---\nstopped: {stop}\n")
    write(OUT / "trajectories" / f"{tid}.json", json.dumps({"id": tid, "scenario_id": a.scenario_id, "stop": stop}))
    log(f"stopped: {stop}  -> {md}")
    print(tid)


# --- judge -------------------------------------------------------------------------------------
def cmd_judge(a):
    meta = json.loads((OUT / "trajectories" / f"{a.trajectory_id}.json").read_text())
    turns = [json.loads(l) for l in (OUT / "trajectories" / f"{a.trajectory_id}.jsonl").read_text().splitlines()]
    prompt = (OUT / "scenarios" / meta["scenario_id"] / "judge_prompt.md").read_text()
    settings(trajectory=a.trajectory_id, scenario=meta["scenario_id"], turns=len(turns))
    log("judging...")
    raw = Chat((PROMPTS / "judge" / "instructions.md").read_text(), JUDGE_MODEL).say(
        prompt + "\n## Transcript\n" + "\n".join(f"{t['role']}: {t['content']}" for t in turns if t["role"] in ("AGENT", "ENVIRONMENT")))
    verdict = parse_json(raw) or {"passed": False, "score": 0, "severity": "critical", "reasoning": "unparseable", "raw": raw}
    path = write(OUT / "judgments" / f"{a.trajectory_id}.json", json.dumps(verdict, indent=2))
    log(f"{'PASS' if verdict.get('passed') else 'FAIL'} score={verdict.get('score')} severity={verdict.get('severity')}  -> {path}")
    log(verdict.get("reasoning", ""))
    print(verdict.get("score"))


def main():
    global client
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create"); c.add_argument("job_id", nargs="?", default=DEFAULT_JOB); c.add_argument("-n", type=int, default=1)
    s = sub.add_parser("simulate"); s.add_argument("scenario_id"); s.add_argument("--max-turns", type=int)
    j = sub.add_parser("judge"); j.add_argument("trajectory_id")
    a = ap.parse_args()
    load_env_file()
    client = anthropic.Anthropic()
    {"create": cmd_create, "simulate": cmd_simulate, "judge": cmd_judge}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
