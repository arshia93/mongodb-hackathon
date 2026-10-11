#!/usr/bin/env python3
"""Official schema for environments/ and routines/ (see README.md). Vanilla Python 3.

Usage:
    python3 environment_plus_routines/validator.py             # same as `validate`
    python3 environment_plus_routines/validator.py validate    # check ALL files, list failures, exit 1 if any
    python3 environment_plus_routines/validator.py visualize   # print environment -> routines tree

Example `validate` output:
    ok    environments/car-dealership-email.md
    FAIL  routines/car-dealership-email--morning-inbox-triage.md
          line 1: 'environment_plus_routines/environments/car-dealership.md' does not exist
          missing '## Tools' under '# Routine'
    1 of 2 files failed

Example `visualize` output:
    car-dealership-email
    └── morning-inbox-triage

Checks: kebab-case filenames, the routine's `Environment:` line (regex, file exists, matches the
filename prefix), and the heading tree below. Headings inside ``` fences are ignored.

TODO(hadriano): review this more carefully. On a quick pass it looks OK but the exact semantics and error/edge
    cases are not tested (too much scope for a hackathon).
NOTE that this is witten entirely by Fable 5.1 via Factory droid.
"""
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent

# ---- Schema. Edit these to change the format. --------------------------------------------
# One heading per line. The text is a regex (full match). Suffix "?" = optional, "*" = zero or
# more. Headings nested under a template heading must appear in this order with nothing else at
# their level; below a template heading with no children, any subheadings are allowed.
ENVIRONMENT_TEMPLATE = r"""
# Environment
## Description
## Input and Output Format
## Dynamics and Semantics
## Examples of scenarios ?
### Scenario \d+ — .+ *
#### What the agent first sees
#### State
#### Expected handling
"""
ROUTINE_TEMPLATE = r"""
# Routine
## Description
## Tools
## Constraints
### Things to do
### Things to NOT do
### Other constraints
"""
KEBAB = r"[a-z0-9]+(?:-[a-z0-9]+)*"
ENVIRONMENT_FILENAME = re.compile(rf"^(?P<env>{KEBAB})\.md$")
ROUTINE_FILENAME = re.compile(rf"^(?P<env>{KEBAB})--(?P<routine>{KEBAB})\.md$")
ENVIRONMENT_REF = re.compile(r"^Environment:\s*(\S+)\s*$")  # first line of a routine
ENVIRONMENT_REF_PATH = "environment_plus_routines/environments/{env}.md"
# -------------------------------------------------------------------------------------------

HEADING = re.compile(r"^(#{1,6}) (.+?)\s*$")


@dataclass
class Node:
    level: int
    text: str
    line: int = 0      # 1-based line in the file (file nodes only)
    flag: str = ""     # "", "?" or "*" (template nodes only)
    children: list = field(default_factory=list)

    def __str__(self):
        return f"{'#' * self.level} {self.text}"


def tree(nodes):
    """Nest a flat list of Nodes by heading level under a synthetic root."""
    root, stack = Node(0, "<root>"), []
    for node in nodes:
        while stack and stack[-1].level >= node.level:
            stack.pop()
        (stack[-1] if stack else root).children.append(node)
        stack.append(node)
    return root


def parse_template(template):
    nodes = []
    for line in template.strip().splitlines():
        hashes, text = HEADING.match(line).groups()
        flag = text[-1] if text[-1] in "?*" else ""
        nodes.append(Node(len(hashes), text.rstrip(" ?*"), flag=flag))
    return tree(nodes)


def parse_file(lines):
    """Headings of a markdown file (skipping ``` fences) as a tree."""
    nodes, fenced = [], False
    for n, line in enumerate(lines, 1):
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced and (m := HEADING.match(line)):
            nodes.append(Node(len(m[1]), m[2], line=n))
    return tree(nodes)


def check_tree(actual, template, errors):
    """Match actual.children against template.children in order, recursing into each match."""
    if not template.children:
        return  # free-form section: any subheadings allowed
    expected, i, seen = template.children, 0, set()  # i = template index we are at

    def missing(start, stop):
        return [f"missing '{expected[k]}' under '{actual}'" for k in range(start, stop) if k not in seen and expected[k].flag == ""]

    for a in actual.children:
        j = next((k for k in range(i, len(expected)) if a.level == expected[k].level and re.fullmatch(expected[k].text, a.text)), None)
        if j is None or (j in seen and expected[j].flag != "*"):
            errors.append(f"line {a.line}: unexpected '{a}' under '{actual}'")
            continue
        errors += missing(i, j)
        i, seen = j, seen | {j}
        check_tree(a, expected[j], errors)
    errors += missing(i, len(expected))


def check_headings(lines, template, body_start):
    """Heading errors for a file: preamble, tree shape, and template headings that reappear."""
    errors, actual = [], parse_file(lines)
    first = actual.children[0].line if actual.children else len(lines) + 1
    if any(l.strip() for l in lines[body_start:first - 1]):
        errors.append("text before the first heading")
    check_tree(actual, template, errors)
    for t in walk(template, skip_repeated=True):  # non-repeated template headings must not reappear anywhere
        lines_with_t = [a.line for a in walk(actual) if a.text == t.text]
        if len(lines_with_t) > 1:
            errors.append(f"'{t.text}' appears {len(lines_with_t)} times (lines {lines_with_t})")
    return errors


def walk(node, skip_repeated=False):
    """All descendants, depth-first; optionally skipping '*' subtrees."""
    for child in node.children:
        if not (skip_repeated and child.flag == "*"):
            yield child
            yield from walk(child, skip_repeated)


def validate_environment(path):
    errors = [] if ENVIRONMENT_FILENAME.match(path.name) else ["filename must be <environment>.md in kebab-case"]
    return errors + check_headings(path.read_text().splitlines(), parse_template(ENVIRONMENT_TEMPLATE), 0)


def validate_routine(path):
    lines, errors = path.read_text().splitlines(), []
    name, ref = ROUTINE_FILENAME.match(path.name), environment_ref(lines)
    if not name:
        errors.append("filename must be <environment>--<routine>.md in kebab-case")
    if ref is None:
        errors.append(f"line 1 must match {ENVIRONMENT_REF.pattern}")
    else:
        if not (REPO_ROOT / ref).is_file():
            errors.append(f"line 1: '{ref}' does not exist (path is relative to repo root)")
        if name and ref != ENVIRONMENT_REF_PATH.format(env=name["env"]):
            errors.append(f"line 1: '{ref}' does not match filename prefix '{name['env']}--'")
    return errors + check_headings(lines, parse_template(ROUTINE_TEMPLATE), 1)


def environment_ref(lines):
    m = ENVIRONMENT_REF.match(lines[0]) if lines else None
    return m[1] if m else None


def files(subdir):
    return sorted((HERE / subdir).glob("*.md"))


def validate():
    jobs = [(p, validate_environment) for p in files("environments")] + [(p, validate_routine) for p in files("routines")]
    failed = 0
    for path, check in jobs:
        errors = check(path)
        failed += bool(errors)
        print(f"{'FAIL' if errors else 'ok  '}  {path.relative_to(HERE)}")
        for e in errors:
            print(f"      {e}")
    print(f"{failed} of {len(jobs)} files failed")
    return 1 if failed else 0


def visualize():
    """Environments and, under each, the routines whose Environment: line points at it."""
    routines = {p.stem: [] for p in files("environments")}
    for p in files("routines"):
        ref = environment_ref(p.read_text().splitlines())
        env = Path(ref).stem if ref else "<no valid Environment: line>"
        routines.setdefault(env, []).append(p.stem.split("--", 1)[-1])
    for env, names in routines.items():
        print(env)
        for i, name in enumerate(sorted(names), 1):
            print(f"{'└──' if i == len(names) else '├──'} {name}")
    return 0


if __name__ == "__main__":
    commands = {"validate": validate, "visualize": visualize}
    command = sys.argv[1] if len(sys.argv) > 1 else "validate"
    if command not in commands:
        sys.exit(__doc__)
    sys.exit(commands[command]())
