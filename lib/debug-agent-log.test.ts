import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "test") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.includes(".test.") &&
      !name.includes(".e2e.test.")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("debug agent log removal", () => {
  it("deletes lib/debug-agent-log.ts", () => {
    expect(existsSync(path.resolve(__dirname, "debug-agent-log.ts"))).toBe(
      false,
    );
  });

  it("leaves no agentDebugLog or LAN ingest references under lib/ (non-test)", () => {
    const files = walkTsFiles(path.resolve(__dirname));
    const hits: string[] = [];
    const re = /agentDebugLog|debug-agent-log|\/ingest\/|127\.0\.0\.1:7859/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (re.test(src)) hits.push(path.relative(__dirname, f));
    }
    expect(hits).toEqual([]);
  });
});
