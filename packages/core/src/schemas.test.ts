import { describe, expect, it } from "vitest";
import { Scenario } from "./schemas";

describe("Scenario (baseline)", () => {
  it("accepts the original six-field shape", () => {
    const parsed = Scenario.parse({
      targetId: "t1",
      category: "happy_path",
      persona: "A polite customer",
      goal: "Get a refund for a late order",
      openingMessage: "Hi, my order is late.",
      successCriteria: ["Agent offers a refund within policy"],
    });
    expect(parsed.category).toBe("happy_path");
  });
});
