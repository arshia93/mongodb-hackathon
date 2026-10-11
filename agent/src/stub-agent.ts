// A stand-in for the agent under test (e.g. GrokBot): an LLM that follows the job's routine.
// Used by the CLI and the evals; swap the system prompt to test a weaker or tighter routine.
import type { AgentUnderTest, Job } from "@preflight/core";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "./models";

export type TextClient = Pick<Anthropic, "messages">;

export function createStubAgent(
  job: Pick<Job, "environment" | "routine">,
  client: TextClient,
  opts: { model?: string } = {},
): AgentUnderTest {
  const system = [
    "You are an AI agent doing the routine below. Everything you receive comes from the environment, and everything you write is sent back to it.",
    "Use the tools and output formats the environment and routine specify, exactly. When you are completely done, say so plainly.",
    "",
    job.environment.trim(),
    "",
    job.routine.trim(),
  ].join("\n");
  let history: Anthropic.MessageParam[] = [];

  return async (message, { firstInScenario }) => {
    if (firstInScenario) history = [];
    history.push({ role: "user", content: message });
    const res = await client.messages.create({
      model: opts.model ?? process.env.PREFLIGHT_AGENT_MODEL ?? DEFAULT_MODEL,
      max_tokens: 4000,
      system,
      messages: history,
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    history.push({ role: "assistant", content: text });
    return text;
  };
}
