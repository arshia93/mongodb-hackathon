import { describe, expect, it } from "vitest";
import type { Models } from "@preflight/core";
import { createModels, loadInstructions, type MessagesClient } from "./models";

type Params = Parameters<MessagesClient["beta"]["messages"]["stream"]>[0];

function fakeClient(reply: { stop_reason?: string; text?: string; category?: string }) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: Params) {
          calls.push(params);
          return {
            finalMessage: async () =>
              ({
                stop_reason: reply.stop_reason ?? "end_turn",
                stop_details: reply.category ? { type: "refusal", category: reply.category } : null,
                content: [{ type: "thinking", thinking: "" }, { type: "text", text: reply.text ?? "ok" }, { type: "text", text: "!" }],
              }) as never,
          };
        },
      },
    },
  } satisfies MessagesClient;
  return { client, calls };
}

describe("createModels", () => {
  it("uses each role's instructions as system prompt and the judge model for the judge", async () => {
    const { client, calls } = fakeClient({});
    const m = createModels({ client, model: "sim-model", judgeModel: "judge-model" });
    for (const role of ["planner", "simulator", "judge"] as const) {
      expect(await m[role]("hello")).toBe("ok!");
    }
    expect(calls.map((c) => c.model)).toEqual(["sim-model", "sim-model", "judge-model"]);
    expect(calls[0].system).toBe(loadInstructions("planner"));
    expect(calls[2].system).toContain("Judge");
    expect(calls[0].messages).toEqual([{ role: "user", content: "hello" }]);
    expect(calls[0].fallbacks).toBe("default");
  });

  it("can turn fallbacks off", async () => {
    const { client, calls } = fakeClient({});
    await createModels({ client, fallbacks: false }).planner("x");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(calls[0].betas).toBeUndefined();
  });

  it("throws on a refusal or a truncated reply instead of returning partial text", async () => {
    const refused = createModels({ client: fakeClient({ stop_reason: "refusal", category: "cyber" }).client });
    await expect(refused.judge("x")).rejects.toThrow(/judge .* refused: cyber/);
    const cut = createModels({ client: fakeClient({ stop_reason: "max_tokens" }).client });
    await expect(cut.planner("x")).rejects.toThrow(/hit max_tokens/);
  });

  it("matches core's Models shape", () => {
    const m: Models = createModels({ client: fakeClient({}).client });
    expect(Object.keys(m).sort()).toEqual(["judge", "planner", "simulator"]);
  });
});
