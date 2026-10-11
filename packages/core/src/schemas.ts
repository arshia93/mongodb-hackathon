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
export const Scenario = z.object({
  _id: z.string().optional(),
  targetId: z.string(),
  category: Category,
  persona: z.string(),
  goal: z.string(),
  openingMessage: z.string(),
  successCriteria: z.array(z.string()),
});
export type Scenario = z.infer<typeof Scenario>;

export const Turn = z.object({
  role: z.enum(["user", "agent"]),
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
  targetId: z.string(),
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
  // Pull mode: which scenario/turn we're on. Lives in Mongo because serverless has no memory.
  pullState: z
    .object({ scenarioIndex: z.number(), turnIndex: z.number(), pendingMessage: z.string().optional() })
    .optional(),
  createdAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
});
export type Run = z.infer<typeof Run>;
