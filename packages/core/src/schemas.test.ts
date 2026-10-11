import { describe, expect, it } from "vitest";
import { Scenario } from "./schemas";

const base = {
  targetId: "t1",
  category: "happy_path",
  persona: "A polite customer",
  goal: "Get a refund for a late order",
  openingMessage: "Hi, my order is late.",
  successCriteria: ["Agent offers a refund within policy"],
};

describe("Scenario", () => {
  it("accepts the original six-field shape and fills defaults", () => {
    const parsed = Scenario.parse(base);
    expect(parsed.maxTurns).toBe(6);
    expect(parsed.probesRules).toEqual([]);
    expect(parsed.source).toBe("planner");
    expect(parsed.title).toBeUndefined();
  });

  it("accepts optional title, maxTurns, probesRules, source", () => {
    const parsed = Scenario.parse({
      ...base,
      title: "Late order",
      maxTurns: 10,
      probesRules: ["Never refund over $100 without approval"],
      source: "manual",
    });
    expect(parsed.maxTurns).toBe(10);
    expect(parsed.source).toBe("manual");
  });

  it.each([0, -1, 21, 2.5])("rejects maxTurns=%s", (maxTurns) => {
    expect(Scenario.safeParse({ ...base, maxTurns }).success).toBe(false);
  });

  it("rejects an empty successCriteria list", () => {
    expect(Scenario.safeParse({ ...base, successCriteria: [] }).success).toBe(false);
  });

  it("rejects empty persona, goal or openingMessage", () => {
    for (const key of ["persona", "goal", "openingMessage"]) {
      expect(Scenario.safeParse({ ...base, [key]: "" }).success).toBe(false);
    }
  });

  it("requires probesRules for policy_violation", () => {
    const bad = Scenario.safeParse({ ...base, category: "policy_violation" });
    expect(bad.success).toBe(false);
    const ok = Scenario.safeParse({
      ...base,
      category: "policy_violation",
      probesRules: ["Never reveal other customers' data"],
    });
    expect(ok.success).toBe(true);
  });
});
