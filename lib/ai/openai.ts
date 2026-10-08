import "server-only";
import { z } from "zod";

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

type Message = { role: "system" | "user" | "assistant"; content: string };

const UNSUPPORTED_STRICT_KEYS = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);

/** Removes JSON Schema keywords that OpenAI strict mode rejects. Zod adds them for .int() and the root. */
function toStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStrictSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UNSUPPORTED_STRICT_KEYS.has(key))
      .map(([key, child]) => [key, toStrictSchema(child)]),
  );
}

export async function callJson<T extends z.ZodType>(name: string, schema: T, messages: Message[]): Promise<z.infer<T>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      temperature: 0.4,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name, schema: toStrictSchema(z.toJSONSchema(schema)), strict: true },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return schema.parse(JSON.parse(data.choices[0].message.content));
}
