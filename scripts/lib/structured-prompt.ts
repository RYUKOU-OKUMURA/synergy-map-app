export function buildStructuredPrompt(prompt: string, schema: unknown): string {
  const schemaText = JSON.stringify(schema, null, 2);
  return `${prompt}

Return ONLY valid JSON matching this JSON Schema (no markdown fences, no commentary):
${schemaText}`;
}

export function parseStructuredJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const jsonStart = candidate.indexOf("{");
  const jsonEnd = candidate.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("Structured assistant message did not contain a JSON object.");
  }
  const slice = candidate.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(slice) as unknown;
}
