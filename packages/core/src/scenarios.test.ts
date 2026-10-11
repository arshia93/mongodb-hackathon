import { describe, expect, it } from "vitest";
import { missingCategories, parseScenarioSet, toScenario } from "./scenarios";

const one = {
  category: "edge_case",
  title: "Empty inbox",
  state: "It is Monday 8:00 AM. The inbox has no unread emails.",
  firstInput: "It is Monday 8:00 AM. Run your inbox triage routine.",
  successCriteria: ["Agent calls done without inventing emails"],
};
const set = JSON.stringify({ scenarios: [one] });

describe("parseScenarioSet", () => {
  it("parses plain JSON and applies defaults", () => {
    const parsed = parseScenarioSet(set);
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0].maxTurns).toBe(20);
  });

  it("strips a ```json fence", () => {
    const parsed = parseScenarioSet("```json\n" + set + "\n```");
    expect(parsed.scenarios).toHaveLength(1);
  });

  it("strips a bare ``` fence with surrounding whitespace", () => {
    expect(parseScenarioSet("\n  ```\n" + set + "\n```  \n").scenarios).toHaveLength(1);
  });

  it("rejects prose with a clear message", () => {
    expect(() => parseScenarioSet("Here are your scenarios!")).toThrow(/^Invalid scenario set:/);
  });

  it("rejects prose before a fenced block", () => {
    expect(() => parseScenarioSet("Here are your scenarios:\n```json\n" + set + "\n```")).toThrow(
      /^Invalid scenario set:/,
    );
  });

  it("rejects an empty list", () => {
    expect(() => parseScenarioSet('{"scenarios":[]}')).toThrow(/^Invalid scenario set:/);
  });

  it("names the failing field and scenario index", () => {
    const bad = JSON.stringify({ scenarios: [{ ...one, state: "" }] });
    expect(() => parseScenarioSet(bad)).toThrow(/scenarios\.0\.state/);
  });

  it("rejects policy_violation without probesRules", () => {
    const bad = JSON.stringify({ scenarios: [{ ...one, category: "policy_violation" }] });
    expect(() => parseScenarioSet(bad)).toThrow(/probesRules/);
  });
});

describe("toScenario", () => {
  it("attaches targetId and defaults source to planner", () => {
    const planned = parseScenarioSet(set).scenarios[0];
    const s = toScenario(planned, "t1");
    expect(s.targetId).toBe("t1");
    expect(s.source).toBe("planner");
    expect(toScenario(planned, "t1", "manual").source).toBe("manual");
  });
});

describe("missingCategories", () => {
  it("reports every category when given nothing", () => {
    expect(missingCategories([])).toHaveLength(8);
  });

  it("reports only the gaps", () => {
    const missing = missingCategories([{ category: "happy_path" }, { category: "edge_case" }]);
    expect(missing).not.toContain("happy_path");
    expect(missing).toContain("persistence");
  });

  it("honours a custom required list", () => {
    expect(missingCategories([{ category: "happy_path" }], ["happy_path"])).toEqual([]);
  });
});
