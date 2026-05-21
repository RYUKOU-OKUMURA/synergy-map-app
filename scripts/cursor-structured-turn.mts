import { Agent } from "@cursor/sdk";
import { buildStructuredPrompt, parseStructuredJson } from "./lib/structured-prompt.ts";

const PLACEHOLDER_CURSOR_API_KEY = "cursor_your_key_here";

function readCursorApiKey(): { trimmed: string; isPlaceholder: boolean } {
  const trimmed = (process.env.CURSOR_API_KEY ?? "").trim();
  return {
    trimmed,
    isPlaceholder: trimmed === PLACEHOLDER_CURSOR_API_KEY,
  };
}

function formatCursorAuthError(error: unknown): string {
  const message = String(error);
  if (message.includes("AuthenticationError")) {
    return "CURSOR_API_KEY が無効です。Cursor Dashboard → Integrations で発行したキーを `.env` に設定し、アプリを再起動してください。";
  }
  return message;
}

type TurnRequest = {
  prompt: string;
  schema: unknown;
  modelId?: string;
  cwd?: string;
};

type TurnResponse = {
  ok: boolean;
  responseJson: unknown | null;
  errors: string[];
  durationMs: number;
  model: string;
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const started = Date.now();
  const modelId = "composer-2.5";
  const apiKeyCheck = readCursorApiKey();

  if (!apiKeyCheck.trimmed) {
    const response: TurnResponse = {
      ok: false,
      responseJson: null,
      errors: ["CURSOR_API_KEY is not set."],
      durationMs: Date.now() - started,
      model: `cursor-sdk/${modelId}`,
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(1);
    return;
  }

  if (apiKeyCheck.isPlaceholder) {
    const response: TurnResponse = {
      ok: false,
      responseJson: null,
      errors: [
        "CURSOR_API_KEY がプレースホルダーのままです。`.env.example` をコピーした `.env` に、Cursor Dashboard で発行した実キーを設定してください。",
      ],
      durationMs: Date.now() - started,
      model: `cursor-sdk/${modelId}`,
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(1);
    return;
  }

  let request: TurnRequest;
  try {
    request = JSON.parse(await readStdin()) as TurnRequest;
  } catch (error) {
    const response: TurnResponse = {
      ok: false,
      responseJson: null,
      errors: [`Invalid stdin JSON: ${String(error)}`],
      durationMs: Date.now() - started,
      model: `cursor-sdk/${modelId}`,
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(1);
    return;
  }

  const resolvedModel = request.modelId?.trim() || modelId;
  const cwd = request.cwd?.trim() || process.cwd();
  const fullPrompt = buildStructuredPrompt(request.prompt, request.schema);

  try {
    const result = await Agent.prompt(fullPrompt, {
      apiKey: apiKeyCheck.trimmed,
      model: { id: resolvedModel },
      local: { cwd, settingSources: [] },
    });

    const text = result.result?.trim() ?? "";
    if (!text) {
      const response: TurnResponse = {
        ok: false,
        responseJson: null,
        errors: ["Cursor SDK returned empty assistant text."],
        durationMs: Date.now() - started,
        model: `cursor-sdk/${resolvedModel}`,
      };
      process.stdout.write(JSON.stringify(response));
      process.exit(1);
      return;
    }

    if (result.status === "error") {
      const response: TurnResponse = {
        ok: false,
        responseJson: null,
        errors: [`Cursor SDK run failed with status: ${result.status}`],
        durationMs: Date.now() - started,
        model: `cursor-sdk/${resolvedModel}`,
      };
      process.stdout.write(JSON.stringify(response));
      process.exit(1);
      return;
    }

    const responseJson = parseStructuredJson(text);
    const response: TurnResponse = {
      ok: true,
      responseJson,
      errors: [],
      durationMs: Date.now() - started,
      model: `cursor-sdk/${resolvedModel}`,
    };
    process.stdout.write(JSON.stringify(response));
  } catch (error) {
    const response: TurnResponse = {
      ok: false,
      responseJson: null,
      errors: [formatCursorAuthError(error)],
      durationMs: Date.now() - started,
      model: `cursor-sdk/${resolvedModel}`,
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(1);
  }
}

void main();
