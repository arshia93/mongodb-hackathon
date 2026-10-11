// Scenario markdown: the human-readable scenario format (planner output and hand-authored files).
// One or more scenarios per document, each starting with a "# Title" heading:
//
//   # Urgent client email buried under newsletters
//
//   - Category: happy_path
//   - Max turns: 20          (optional)
//
//   ## State                 (markdown; use ### or deeper headings inside sections)
//   ## First input
//   ## Success criteria      (bullet list)
//   ## Rules probed          (bullet list; optional, required for policy_violation)
import { stripFence } from "./json";
import { listItems } from "./md";
import { parseScenarioSet, PlannedScenario } from "./scenarios";

const FIELDS: Record<string, "category" | "maxTurns"> = {
  category: "category",
  "max turns": "maxTurns",
};
const SECTIONS: Record<string, "state" | "firstInput" | "successCriteria" | "probesRules"> = {
  state: "state",
  "first input": "firstInput",
  "success criteria": "successCriteria",
  "rules probed": "probesRules",
};

function fail(message: string): never {
  throw new Error(`Invalid scenario markdown: ${message}`);
}

function parseOne(title: string, body: string, n: number): PlannedScenario {
  const where = `scenario ${n} ("${title}")`;
  const raw: Record<string, unknown> = { title };
  const [preamble, ...sections] = body.split(/^## /m);

  for (const line of preamble.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*[-*]\s+([^:]+):\s*(.*?)\s*$/);
    const key = m ? FIELDS[m[1].trim().toLowerCase()] : undefined;
    if (!m || !key) fail(`${where}: unexpected line before the first section: "${line.trim()}"`);
    raw[key] = key === "maxTurns" ? Number(m[2]) : m[2];
  }

  for (const section of sections) {
    const nl = section.indexOf("\n");
    const name = (nl === -1 ? section : section.slice(0, nl)).trim();
    const content = nl === -1 ? "" : section.slice(nl + 1).trim();
    const key = SECTIONS[name.toLowerCase()];
    if (!key) fail(`${where}: unknown section "## ${name}"`);
    if (key in raw) fail(`${where}: duplicate section "## ${name}"`);
    raw[key] = key === "successCriteria" || key === "probesRules" ? listItems(content) : content;
  }

  const result = PlannedScenario.safeParse(raw);
  if (!result.success) {
    fail(`${where}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}

export function parseScenarioMarkdown(text: string): PlannedScenario[] {
  const [before, ...blocks] = stripFence(text).split(/^# /m);
  if (before.trim()) fail(`text before the first "# Title" heading: "${before.trim().slice(0, 60)}"`);
  if (blocks.length === 0) fail('no scenarios (each starts with a "# Title" heading)');
  return blocks.map((block, i) => {
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim();
    return parseOne(title, nl === -1 ? "" : block.slice(nl + 1), i + 1);
  });
}

export function renderScenarioMarkdown(scenarios: PlannedScenario[]): string {
  const docs = scenarios.map((s) => {
    const lines = [
      `# ${s.title}`,
      "",
      `- Category: ${s.category}`,
      `- Max turns: ${s.maxTurns}`,
      "",
      "## State",
      "",
      s.state.trim(),
      "",
      "## First input",
      "",
      s.firstInput.trim(),
      "",
      "## Success criteria",
      "",
      ...s.successCriteria.map((c) => `- ${c}`),
    ];
    if (s.probesRules.length > 0) {
      lines.push("", "## Rules probed", "", ...s.probesRules.map((r) => `- ${r}`));
    }
    return lines.join("\n");
  });
  return docs.join("\n\n") + "\n";
}

// Either format: a JSON scenario set or scenario markdown, fenced or not.
export function parseScenarios(text: string): PlannedScenario[] {
  return stripFence(text).startsWith("{")
    ? parseScenarioSet(text).scenarios
    : parseScenarioMarkdown(text);
}
