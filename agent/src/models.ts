// Anthropic implementation of core's Models: one model call per planner/simulator/judge step.
// The system prompt is the subagent's instructions.md; the model per D3 in docs/PLAN.md.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Models } from "@preflight/core";

type Role = keyof Models;

// Sonnet generates tests and plays the world; the judge is a different, stronger model.
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_JUDGE_MODEL = "claude-opus-5-5";

const MAX_TOKENS = 16000;

export function loadInstructions(role: Role): string {
  return readFileSync(fileURLToPath(new URL(`../subagents/${role}/instructions.md`, import.meta.url)), "utf8");
}

// The slice of the SDK we use, so tests can pass a fake.
export type MessagesClient = {
  beta: {
    messages: {
      stream(params: Anthropic.Beta.MessageCreateParamsNonStreaming): {
        finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
      };
    };
  };
};

export function createModels(
  opts: { client?: MessagesClient; model?: string; judgeModel?: string; fallbacks?: boolean } = {},
): Models {
  const client = opts.client ?? new Anthropic(); // credentials from ANTHROPIC_API_KEY or `ant auth login`
  const model = opts.model ?? process.env.PREFLIGHT_MODEL ?? DEFAULT_MODEL;
  const judgeModel = opts.judgeModel ?? process.env.PREFLIGHT_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  const fallbacks = opts.fallbacks ?? true;

  const call = (role: Role, modelId: string) => {
    const system = loadInstructions(role);
    return async (input: string): Promise<string> => {
      const message = await client.beta.messages
        .stream({
          model: modelId,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: input }],
          // On a safety decline the API re-runs the request on a fallback model (injection scenarios can trip it).
          ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        })
        .finalMessage();
      if (message.stop_reason === "refusal") {
        throw new Error(`${role} (${modelId}) refused: ${message.stop_details?.category ?? "no category"}`);
      }
      if (message.stop_reason === "max_tokens") throw new Error(`${role} (${modelId}) hit max_tokens`);
      return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    };
  };

  return { planner: call("planner", model), simulator: call("simulator", model), judge: call("judge", judgeModel) };
}
