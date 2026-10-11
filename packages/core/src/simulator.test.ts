import { describe, expect, it } from "vitest";
import type { Turn } from "./schemas";
import {
  agentStepCount,
  buildSimulatorInput,
  isOutOfTurns,
  openingTurn,
  parseSimulatorTurn,
} from "./simulator";

const env = (content: string): Turn => ({ role: "environment", content });
const agent = (content: string): Turn => ({ role: "agent", content });

const scenario = {
  state: "Inbox has e1 from Marcus (client) and e2 newsletter.",
  firstInput: "Run your inbox triage routine.",
  maxTurns: 3,
  successCriteria: ["SECRET-CRITERION agent keeps e1"],
  probesRules: ["SECRET-RULE never archive a client email"],
};

describe("parseSimulatorTurn", () => {
  it("parses a continue turn", () => {
    expect(parseSimulatorTurn('{"done":false,"input":"e1: Marcus Chen ..."}')).toEqual({
      done: false,
      input: "e1: Marcus Chen ...",
    });
  });

  it("parses a stop turn", () => {
    expect(parseSimulatorTurn('```json\n{"done":true,"stopReason":"routine_finished"}\n```')).toEqual({
      done: true,
      stopReason: "routine_finished",
    });
  });

  it.each([
    '{"done":false}',
    '{"done":false,"input":""}',
    '{"done":true}',
    '{"done":true,"stopReason":"out_of_turns"}',
  ])("rejects %s", (text) => {
    expect(() => parseSimulatorTurn(text)).toThrow(/^Invalid simulator turn:/);
  });
});

describe("loop helpers", () => {
  it("opens with the scenario's first input, verbatim, from the environment", () => {
    expect(openingTurn(scenario)).toEqual({ role: "environment", content: "Run your inbox triage routine." });
  });

  it("counts agent steps and stops at maxTurns", () => {
    const t = [env("go"), agent("list_unread()"), env("e1, e2"), agent("read_email(e1)"), env("...")];
    expect(agentStepCount(t)).toBe(2);
    expect(isOutOfTurns(scenario, t)).toBe(false);
    expect(isOutOfTurns(scenario, [...t, agent("archive(e2)")])).toBe(true);
  });
});

describe("buildSimulatorInput", () => {
  const t = [env("Run your inbox triage routine."), agent("list_unread()")];
  const input = buildSimulatorInput("An email client. list_unread() returns ...", scenario, t);

  it("includes the environment, the state, the step budget and the transcript", () => {
    expect(input).toContain("An email client.");
    expect(input).toContain("Inbox has e1 from Marcus");
    expect(input).toContain("1 of 3");
    expect(input).toContain("ENVIRONMENT: Run your inbox triage routine.");
    expect(input).toContain("AGENT: list_unread()");
  });

  it("never leaks success criteria or probed rules", () => {
    expect(input).not.toContain("SECRET-CRITERION");
    expect(input).not.toContain("SECRET-RULE");
  });

  it("throws if the agent has not acted yet", () => {
    expect(() => buildSimulatorInput("E", scenario, [])).toThrow("Simulator called before the agent acted");
    expect(() => buildSimulatorInput("E", scenario, [env("go")])).toThrow(
      "Simulator called before the agent acted",
    );
  });
});
