// Parsing model replies. Shared by the planner, simulator and judge.
import type { z } from "zod";

// Models like to wrap replies in a markdown fence; accept that, nothing more lenient.
export function stripFence(text: string): string {
  const match = text.trim().match(/^```(?:json|markdown|md)?[ \t]*\n([\s\S]*?)\n\s*```$/);
  return match ? match[1] : text.trim();
}

export function parseModelJson<T extends z.ZodTypeAny>(
  text: string,
  schema: T,
  label: string,
): z.output<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch (err) {
    throw new Error(`Invalid ${label}: not valid JSON (${(err as Error).message})`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid ${label}: ${detail}`);
  }
  return result.data;
}
