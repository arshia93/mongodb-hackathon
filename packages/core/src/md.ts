// Bullet items ("- x" or "* x") in a block of markdown, in order. Other lines are ignored.
export function listItems(md: string): string[] {
  return md
    .split("\n")
    .map((line) => line.match(/^\s*[-*]\s+(.*\S)\s*$/)?.[1])
    .filter((item): item is string => item !== undefined);
}
