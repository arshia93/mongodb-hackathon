// Shared contract. Mirrors the Mongo collections and the judge's JSON output.
// Change this in small PRs that land quickly — everyone depends on it.
import { z } from "zod";

export const Category = z.enum([
  "happy_path",
  "edge_case",
  "ambiguous_request",
  "prompt_injection",
  "policy_violation",
  "tool_misuse",
  "hallucination",
  "persistence",
]);
export type Category = z.infer<typeof Category>;

export const Severity = z.enum(["low", "med", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const RunMode = z.enum(["push", "pull"]);
export type RunMode = z.infer<typeof RunMode>;

// How Preflight reaches the agent under test.
export const AdapterConfig = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    // Request body template; defaults to OpenAI-chat-compatible when omitted.
    requestTemplate: z.string().optional(),
    // JSONPath to the reply text in the response body.
    replyPath: z.string().default("$.choices[0].message.content"),
  }),
  z.object({ kind: z.literal("pull") }),
]);
export type AdapterConfig = z.infer<typeof AdapterConfig>;

// collection: targets
export const Target = z.object({
  _id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string().optional(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })).default([]),
  mustRules: z.array(z.string()).default([]),
  mustNotRules: z.array(z.string()).default([]),
  adapter: AdapterConfig,
  createdAt: z.coerce.date().optional(),
});
export type Target = z.infer<typeof Target>;

// collection: scenarios
export const ScenarioSource = z.enum(["planner", "regression", "manual", "production"]);
export type ScenarioSource = z.infer<typeof ScenarioSource>;

// A scenario = an environment + a specific state (environment_plus_routines/README.md),
// plus what the judge needs to grade the rollout.
export const ScenarioShape = z.object({
  _id: z.string().optional(),
  // The job under test: the routine file name without .md, e.g. "car-dealership-email--morning-inbox-triage".
  jobId: z.string(),
  category: Category,
  title: z.string().min(1),
  // The specifics the environment leaves open (markdown), e.g. the exact emails in the inbox.
  state: z.string().min(1),
  // What the agent under test receives first: a trigger, a person's message, etc.
  firstInput: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  // Safety cap on agent steps; normally the simulator ends the rollout first.
  maxTurns: z.number().int().min(1).max(50).default(20),
  // Routine constraints ("Things to do" / "Things to NOT do") this scenario tests, verbatim.
  probesRules: z.array(z.string().min(1)).default([]),
  source: ScenarioSource.default("planner"),
});

// A policy_violation scenario with no rule to probe gives the judge nothing to grade against.
export function requireRulesForPolicyViolation(
  s: { category: Category; probesRules: string[] },
  ctx: z.RefinementCtx,
): void {
  if (s.category === "policy_violation" && s.probesRules.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["probesRules"],
      message: "policy_violation scenarios must list the rule(s) they probe",
    });
  }
}

// Scenario is refined, so .extend/.pick/.omit are unavailable; derive from ScenarioShape and re-apply requireRulesForPolicyViolation.
export const Scenario = ScenarioShape.superRefine(requireRulesForPolicyViolation);
export type Scenario = z.infer<typeof Scenario>;

// environment = anything the simulator produces (trigger, tool result, a person's message);
// agent = anything the agent under test emits (tool call, message).
export const Turn = z.object({
  role: z.enum(["environment", "agent"]),
  content: z.string(),
});
export type Turn = z.infer<typeof Turn>;

export const JudgeOutput = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  category: Category,
  failed_rules: z.array(z.string()),
  evidence_quote: z.string(),
  reasoning: z.string(),
  severity: Severity,
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

// collection: results
export const Result = z.object({
  _id: z.string().optional(),
  runId: z.string(),
  scenarioId: z.string(),
  transcript: z.array(Turn),
  judge: JudgeOutput.optional(),
  // Embedding of the failure summary, for Atlas Vector Search.
  embedding: z.array(z.number()).optional(),
});
export type Result = z.infer<typeof Result>;

export const RunStatus = z.enum(["queued", "planning", "running", "judging", "done", "error"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Verdict = z.enum(["go", "no_go"]);
export type Verdict = z.infer<typeof Verdict>;

// collection: runs
export const Run = z.object({
  _id: z.string().optional(),
  jobId: z.string(),
  status: RunStatus,
  mode: RunMode,
  models: z.object({ default: z.string(), judge: z.string() }),
  passThreshold: z.number().default(0.85),
  summary: z
    .object({
      passRate: z.number(),
      byCategory: z.record(z.object({ passed: z.number(), total: z.number() })),
      criticalFailures: z.number(),
    })
    .optional(),
  verdict: Verdict.optional(),
  // Pull mode: everything needed to resume between calls. Lives in Mongo because serverless has no memory.
  pullState: z
    .object({
      scenarios: z.array(Scenario).default([]),
      scenarioIndex: z.number(),
      // Transcript of the scenario in progress.
      transcript: z.array(Turn).default([]),
      // Judge output for each finished scenario, in scenario order.
      results: z.array(JudgeOutput).default([]),
      pendingMessage: z.string().optional(),
    })
    .optional(),
  createdAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
});
export type Run = z.infer<typeof Run>;
