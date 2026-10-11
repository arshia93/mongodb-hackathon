// Runs the MCP route in-process, so no dev server is needed.
// Uses whatever database MONGODB_URI points to; run it against a local MongoDB by default.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "../app/api/mcp/route";
import { getDb } from "../lib/db";
import { seed } from "../lib/seed";

const inProcessFetch = (input: string | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  if (request.method === "GET") return GET(request);
  if (request.method === "DELETE") return DELETE(request);
  return POST(request);
};

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };

const callJson = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content[0].text ?? "";
  return { isError: result.isError, text, body: result.isError ? null : JSON.parse(text) };
};

const client = new Client({ name: "preflight-test", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
  fetch: inProcessFetch,
});
const created: Array<{ collection: "targets" | "runs"; id: string }> = [];

beforeAll(async () => {
  await seed(getDb());
  await client.connect(transport);
});

afterAll(async () => {
  const db = getDb();
  for (const { collection, id } of created) {
    await db.collection<{ _id?: string }>(collection).deleteOne({ _id: id });
  }
  await client.close();
});

describe("MCP push tools", () => {
  it("lists the three push tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "preflight_get_report",
      "preflight_register_target",
      "preflight_run_suite",
    ]);
  });

  it("starts a run for a job and reads it back as queued", async () => {
    const run = await callJson(client, "preflight_run_suite", { jobId: "car-dealership-email--morning-inbox-triage", mode: "push" });
    expect(run.isError).toBeFalsy();
    const { runId } = run.body as { runId: string };
    created.push({ collection: "runs", id: runId });

    const report = await callJson(client, "preflight_get_report", { runId });
    expect(report.body.run.status).toBe("queued");
    expect(report.body.results).toEqual([]);
  });

  it("returns the seeded refund-bot report", async () => {
    const report = await callJson(client, "preflight_get_report", {
      runId: "syn_run_refund_001",
    });
    expect(report.body.run.verdict).toBe("no_go");
    expect(report.body.results).toHaveLength(8);
    expect(report.body.dashboardPath).toBe("/runs/syn_run_refund_001");
  });

  it("returns a tool error for an unknown job", async () => {
    const run = await callJson(client, "preflight_run_suite", {
      jobId: "does-not-exist",
      mode: "push",
    });
    expect(run.isError).toBe(true);
    expect(run.text).toContain("Job not found");
  });
});
