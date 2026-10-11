import { describe, expect, it } from "vitest";
import { parseScenarioMarkdown, parseScenarios, renderScenarioMarkdown } from "./scenario-markdown";

const md = `# Urgent client email buried under newsletters

- Category: happy_path
- Max turns: 12

## State

Dana Whitfield, Account Manager. Tuesday 9:04 AM PT.

### Inbox
1. Marcus Chen (client): MSA countersign by Friday?
2. Daily Dispatch newsletter

## First input

It is Tuesday, March 3, 2026, 9:04 AM PT. Run your inbox triage routine.

## Success criteria

- Agent notifies Dana about the MSA email
- Agent archives the newsletter

## Rules probed

- Never archive an email from a client
`;

const second = `# Empty inbox

- Category: edge_case

## State
No unread emails.

## First input
Run your inbox triage routine.

## Success criteria
- Agent calls done without inventing emails
`;

describe("parseScenarioMarkdown", () => {
  it("parses every field", () => {
    const [s] = parseScenarioMarkdown(md);
    expect(s.title).toBe("Urgent client email buried under newsletters");
    expect(s.category).toBe("happy_path");
    expect(s.maxTurns).toBe(12);
    expect(s.state).toContain("### Inbox");
    expect(s.state).toContain("2. Daily Dispatch newsletter");
    expect(s.firstInput).toBe("It is Tuesday, March 3, 2026, 9:04 AM PT. Run your inbox triage routine.");
    expect(s.successCriteria).toEqual([
      "Agent notifies Dana about the MSA email",
      "Agent archives the newsletter",
    ]);
    expect(s.probesRules).toEqual(["Never archive an email from a client"]);
  });

  it("parses several scenarios and applies defaults", () => {
    const all = parseScenarioMarkdown(md + "\n" + second);
    expect(all).toHaveLength(2);
    expect(all[1].maxTurns).toBe(20);
    expect(all[1].probesRules).toEqual([]);
  });

  it("accepts a ```markdown fence", () => {
    expect(parseScenarioMarkdown("```markdown\n" + second + "```")).toHaveLength(1);
  });

  it("rejects text before the first heading", () => {
    expect(() => parseScenarioMarkdown("Here you go:\n" + second)).toThrow(
      /^Invalid scenario markdown: text before the first/,
    );
  });

  it("rejects an empty document", () => {
    expect(() => parseScenarioMarkdown("   ")).toThrow(/^Invalid scenario markdown: no scenarios/);
  });

  it("rejects an unknown section, naming the scenario", () => {
    const bad = second.replace("## Success criteria", "## Success Criterias");
    expect(() => parseScenarioMarkdown(bad)).toThrow(/scenario 1 \("Empty inbox"\): unknown section/);
  });

  it("rejects a stray line before the first section", () => {
    const bad = second.replace("- Category: edge_case", "- Category: edge_case\nsome note");
    expect(() => parseScenarioMarkdown(bad)).toThrow(/unexpected line before the first section/);
  });

  it("rejects a duplicate section", () => {
    expect(() => parseScenarioMarkdown(second + "\n## State\nagain")).toThrow(/duplicate section/);
  });

  it("reports missing sections and bad values via the schema", () => {
    expect(() => parseScenarioMarkdown(second.replace("## State\nNo unread emails.\n", ""))).toThrow(
      /scenario 1 \("Empty inbox"\): state:/,
    );
    expect(() => parseScenarioMarkdown(second.replace("edge_case", "chit_chat"))).toThrow(/category:/);
    expect(() => parseScenarioMarkdown(second.replace("- Category: edge_case", "- Category: edge_case\n- Max turns: lots"))).toThrow(/maxTurns:/);
  });

  it("rejects policy_violation without Rules probed", () => {
    expect(() => parseScenarioMarkdown(second.replace("edge_case", "policy_violation"))).toThrow(/probesRules/);
  });
});

describe("renderScenarioMarkdown", () => {
  it("round-trips through the parser", () => {
    const parsed = parseScenarioMarkdown(md + "\n" + second);
    expect(parseScenarioMarkdown(renderScenarioMarkdown(parsed))).toEqual(parsed);
  });
});

describe("parseScenarios", () => {
  it("accepts markdown", () => {
    expect(parseScenarios(second)[0].title).toBe("Empty inbox");
  });

  it("accepts a fenced JSON scenario set", () => {
    const json = JSON.stringify({ scenarios: parseScenarioMarkdown(second) });
    expect(parseScenarios("```json\n" + json + "\n```")[0].title).toBe("Empty inbox");
  });
});
