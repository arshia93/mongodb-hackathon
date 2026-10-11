import { Run, RunMode, Target } from "@preflight/core";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { getReport, registerTarget, runner } from "../../../lib/store";

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const handler = createMcpHandler((server) => {
  server.registerTool(
    "preflight_register_target",
    {
      title: "Register target",
      description: "Register an agent to test. Returns its targetId.",
      inputSchema: Target.omit({ _id: true, createdAt: true }).shape,
    },
    async (spec) => asText({ targetId: await registerTarget(spec) }),
  );

  server.registerTool(
    "preflight_run_suite",
    {
      title: "Run suite",
      description: "Start a QA run against a registered target. Returns runId.",
      inputSchema: { targetId: z.string(), mode: RunMode },
    },
    async ({ targetId, mode }) => asText(await runner.startRun(targetId, mode)),
  );

  server.registerTool(
    "preflight_get_report",
    {
      title: "Get report",
      description: "Get the scorecard and per-scenario results for a run.",
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => asText(await getReport(runId)),
  );
}, {}, { basePath: "/api" });

export { handler as GET, handler as POST, handler as DELETE };
