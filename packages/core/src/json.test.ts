import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseModelJson, stripFence } from "./json";

const Thing = z.object({ n: z.number() });

describe("stripFence", () => {
  it.each(["json", "markdown", "md", ""])("strips a ```%s fence", (lang) => {
    expect(stripFence("```" + lang + "\nhello\n```")).toBe("hello");
  });

  it("leaves unfenced text alone, trimmed", () => {
    expect(stripFence("  # Title\n")).toBe("# Title");
  });
});

describe("parseModelJson", () => {
  it("parses fenced JSON", () => {
    expect(parseModelJson('```json\n{"n":2}\n```', Thing, "thing")).toEqual({ n: 2 });
  });

  it("uses the label in JSON errors", () => {
    expect(() => parseModelJson("nope", Thing, "thing")).toThrow(/^Invalid thing: not valid JSON/);
  });

  it("uses the label and path in schema errors", () => {
    expect(() => parseModelJson('{"n":"x"}', Thing, "thing")).toThrow(/^Invalid thing: n:/);
  });
});
