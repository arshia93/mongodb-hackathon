import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRoutine, unknownProbedRules } from "./environment";
import { listJobs, loadJob } from "./job";

describe("loadJob (repo files)", () => {
  it("loads every job in the repo with its environment and rules", () => {
    const ids = listJobs();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const job = loadJob(id);
      expect(job.environment.length).toBeGreaterThan(0);
      expect(job.mustDo.length).toBeGreaterThan(0);
      expect(job.mustNotDo.length).toBeGreaterThan(0);
    }
  });

  it("loads the car dealership job", () => {
    const job = loadJob("car-dealership-email--morning-inbox-triage");
    expect(job.environmentPath).toBe("environment_plus_routines/environments/car-dealership-email.md");
    expect(job.environment).toContain("# Environment");
    expect(job.mustNotDo).toContain("Do NOT send more than one email to the same customer about the same request.");
  });
});

describe("loadJob (synthetic repo)", () => {
  const repo = mkdtempSync(join(tmpdir(), "job-"));
  mkdirSync(join(repo, "environment_plus_routines/environments"), { recursive: true });
  mkdirSync(join(repo, "environment_plus_routines/routines"), { recursive: true });
  writeFileSync(join(repo, "environment_plus_routines/environments/e.md"), "# Environment\nE");
  const routine = (ref: string) =>
    `Environment: ${ref}\n\n# Routine\n## Constraints\n### Things to do\n- A\n### Things to NOT do\n- Never B\n`;
  writeFileSync(join(repo, "environment_plus_routines/routines/e--r.md"), routine("environment_plus_routines/environments/e.md"));
  writeFileSync(join(repo, "environment_plus_routines/routines/e--bad.md"), routine("environment_plus_routines/environments/x.md"));
  writeFileSync(join(repo, "environment_plus_routines/routines/e--up.md"), routine("environment_plus_routines/environments/../../x.md"));

  it("follows the Environment: line", () => {
    expect(loadJob("e--r", repo)).toMatchObject({ id: "e--r", environment: "# Environment\nE", mustDo: ["A"], mustNotDo: ["Never B"] });
  });

  it("rejects a wrong file name prefix or a path that escapes", () => {
    expect(() => loadJob("e--bad", repo)).toThrow(/expected "Environment:/);
    expect(() => loadJob("e--up", repo)).toThrow(/expected "Environment:/);
  });

  it("reports a missing job", () => {
    expect(() => loadJob("e--nope", repo)).toThrow(/Job not found: e--nope/);
  });

  it("rejects ids that are not plain kebab-case names", () => {
    expect(() => loadJob("../etc/passwd", repo)).toThrow(/Invalid job id/);
  });
});

describe("parseRoutine", () => {
  it("requires the Environment: line first", () => {
    expect(() => parseRoutine("# Routine\nx")).toThrow(/^Invalid routine:/);
    expect(() => parseRoutine("Environment: a.md\n\nno heading")).toThrow(/^Invalid routine:/);
  });

  it("returns empty lists when a constraints heading is missing", () => {
    const r = parseRoutine("Environment: a.md\n\n# Routine\n## Description\nR");
    expect(r.mustDo).toEqual([]);
    expect(r.mustNotDo).toEqual([]);
  });
});

describe("unknownProbedRules", () => {
  const job = { mustDo: ["Do A"], mustNotDo: ["Never B"] };

  it("is empty when every probed rule matches verbatim", () => {
    expect(unknownProbedRules([{ probesRules: ["Do A"] }, { probesRules: ["Never B", "Do A"] }], job)).toEqual([]);
  });

  it("reports near-misses once each", () => {
    expect(unknownProbedRules([{ probesRules: ["never B"] }, { probesRules: ["never B"] }], job)).toEqual(["never B"]);
  });
});
