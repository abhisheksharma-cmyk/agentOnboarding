import fetch from "node-fetch";
import { AgentContext, AgentOutput } from "../types/types";

export async function callHttpAgent(endpoint: string, ctx: AgentContext, timeoutMs: number): Promise<AgentOutput> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { context: ctx } }),
      signal: controller.signal as any,
    });

    if (!res.ok) {
      throw new Error(`Agent HTTP error ${res.status}`);
    }

    const json = (await res.json()) as AgentOutput;
    return json;
  } finally {
    clearTimeout(id);
  }
}
