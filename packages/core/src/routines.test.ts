import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const routinesDir = join(repoRoot, "environment_plus_routines", "routines");
const environmentsDir = join(repoRoot, "environment_plus_routines", "environments");

// Must match the format documented in environment_plus_routines/README.md.
const ENVIRONMENT_REF = /^Environment:\s*(\S+)\s*$/;

const routineFiles = readdirSync(routinesDir).filter((f) => f.endsWith(".md"));

describe("environment_plus_routines", () => {
  it("has at least one routine", () => {
    expect(routineFiles.length).toBeGreaterThan(0);
  });

  describe.each(routineFiles)("%s", (file) => {
    const md = readFileSync(join(routinesDir, file), "utf8");
    const firstLine = md.split("\n", 1)[0];
    const match = firstLine.match(ENVIRONMENT_REF);

    it("starts with an Environment: reference", () => {
      expect(match, `first line was: ${JSON.stringify(firstLine)}`).not.toBeNull();
    });

    it("references an environment file that exists, by repo-root-relative path", () => {
      const ref = match![1];
      expect(ref.startsWith("/")).toBe(false);
      expect(ref.startsWith("environment_plus_routines/environments/")).toBe(true);
      expect(ref.endsWith(".md")).toBe(true);
      const target = resolve(repoRoot, ref);
      expect(target.startsWith(environmentsDir)).toBe(true);
      expect(existsSync(target), `${ref} does not exist`).toBe(true);
    });

    it("has a # Routine root section", () => {
      expect(md).toMatch(/^# Routine$/m);
    });
  });
});
