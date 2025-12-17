import fetch from "node-fetch";
import { AgentContext, AgentOutput } from "../types/types";
import { resolveAgent } from "../registry/agentRegistry";
export async function callHttpAgent(
  endpoint: string,
  ctx: AgentContext,
  timeoutMs: number = 30000
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ctx.payload),  // Make sure this matches the expected format
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`HTTP error! status: ${response.status}`);
      (error as any).cause = errorData;
      throw error;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
