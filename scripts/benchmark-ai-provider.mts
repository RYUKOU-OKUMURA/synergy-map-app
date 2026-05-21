/**
 * Development benchmark: compares Cursor SDK structured turn duration.
 * Codex timing should be measured from the app (Tauri) or codex CLI separately.
 *
 * Usage:
 *   export CURSOR_API_KEY="..."
 *   pnpm exec tsx scripts/benchmark-ai-provider.mts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixturePrompt = `MVP-1の顧客導線ビューとして、次の抽出カードから1枚のシナジーマップを生成してください。
nodesは2D座標で配置し、schemaVersionはmvp1.v1です。

Extracted items:
- id: item-1
  name: Web問い合わせ
  type: channel
  confidence: confirmed
  summary: 新規商談の入口`;

const fixtureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "nodes", "edges"],
  properties: {
    schemaVersion: { type: "string" },
    nodes: { type: "array" },
    edges: { type: "array" },
  },
};

function runCursorTurn(): Promise<{ ok: boolean; durationMs: number; errors: string[] }> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "scripts/cursor-structured-turn.mts"],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const payload = JSON.stringify({
      prompt: fixturePrompt,
      schema: fixtureSchema,
      modelId: "composer-2.5",
      cwd: repoRoot,
    });
    child.stdin.write(payload);
    child.stdin.end();

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout) as {
          ok: boolean;
          durationMs: number;
          errors: string[];
        };
        resolve(parsed);
      } catch {
        resolve({
          ok: false,
          durationMs: 0,
          errors: [`Invalid bridge stdout: ${stdout.slice(0, 200)}`],
        });
      }
    });
  });
}

async function main() {
  const iterations = Number(process.env.BENCH_ITERATIONS ?? "2");
  const results: number[] = [];

  console.log(`Benchmark repo: ${repoRoot}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`CURSOR_API_KEY: ${process.env.CURSOR_API_KEY ? "set" : "missing"}`);

  if (!process.env.CURSOR_API_KEY) {
    console.error("Set CURSOR_API_KEY before running the benchmark.");
    process.exit(1);
  }

  for (let index = 0; index < iterations; index += 1) {
    const result = await runCursorTurn();
    if (!result.ok) {
      console.error(`Run ${index + 1} failed:`, result.errors.join("; "));
      process.exit(1);
    }
    results.push(result.durationMs);
    console.log(`Run ${index + 1}: ${result.durationMs}ms`);
  }

  const avg = Math.round(results.reduce((sum, value) => sum + value, 0) / results.length);
  console.log(`Cursor SDK average: ${avg}ms`);
  console.log("Compare with Codex via Tauri map generation and ai_runs durationMs.");
}

void main();
