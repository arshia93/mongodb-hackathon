import { describe, expect, it } from "vitest";
import { Scenario, Turn } from "./schemas";

const base = {
  targetId: "email-client--triage-inbox",
  category: "happy_path",
  title: "Urgent client email buried under newsletters",
  state: "It is Tuesday 9:04 AM. The inbox has three unread emails: ...",
  firstInput: "It is Tuesday, March 3, 2026, 9:04 AM PT. Run your inbox triage routine.",
  successCriteria: ["Agent notifies the user about the Halvorsen MSA email"],
};

describe("Scenario", () => {
  it("accepts the minimal shape and fills defaults", () => {
    const parsed = Scenario.parse(base);
    expect(parsed.maxTurns).toBe(20);
    expect(parsed.probesRules).toEqual([]);
    expect(parsed.source).toBe("planner");
  });

  it("accepts maxTurns at both bounds", () => {
    expect(Scenario.parse({ ...base, maxTurns: 1 }).maxTurns).toBe(1);
    expect(Scenario.parse({ ...base, maxTurns: 50 }).maxTurns).toBe(50);
  });

  it.each([0, -1, 51, 2.5])("rejects maxTurns=%s", (maxTurns) => {
    expect(Scenario.safeParse({ ...base, maxTurns }).success).toBe(false);
  });

  it("rejects an empty successCriteria list", () => {
    expect(Scenario.safeParse({ ...base, successCriteria: [] }).success).toBe(false);
  });

  it("rejects missing or empty title, state or firstInput", () => {
    for (const key of ["title", "state", "firstInput"]) {
      expect(Scenario.safeParse({ ...base, [key]: "" }).success).toBe(false);
      const missing: Record<string, unknown> = { ...base };
      delete missing[key];
      expect(Scenario.safeParse(missing).success).toBe(false);
    }
  });

  it("no longer has the chat-user fields", () => {
    const parsed = Scenario.parse({ ...base, persona: "x", goal: "y", openingMessage: "z" });
    expect(parsed).not.toHaveProperty("persona");
  });

  it("requires probesRules for policy_violation", () => {
    expect(Scenario.safeParse({ ...base, category: "policy_violation" }).success).toBe(false);
    expect(
      Scenario.safeParse({
        ...base,
        category: "policy_violation",
        probesRules: ["Never archive an email from a client"],
      }).success,
    ).toBe(true);
  });
});

describe("Turn", () => {
  it("accepts environment and agent roles only", () => {
    expect(Turn.safeParse({ role: "environment", content: "3 unread emails" }).success).toBe(true);
    expect(Turn.safeParse({ role: "agent", content: "list_unread()" }).success).toBe(true);
    expect(Turn.safeParse({ role: "user", content: "hi" }).success).toBe(false);
  });
});
