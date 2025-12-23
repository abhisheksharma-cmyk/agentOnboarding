import fetch from "node-fetch";
import type { AgentContext } from '../agents/BaseAgent';
export async function callHttpAgent(
  endpoint: string,
  ctx: AgentContext,
  timeoutMs: number = 30000
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Extract the address data from the payload
    const payload = ctx.payload?.payload || ctx.payload;
    const addressData = payload?.address || {
      line1: payload?.line1 || payload?.street,
      city: payload?.city,
      state: payload?.state,
      postalCode: payload?.postalCode || payload?.zipCode,
      country: payload?.country || 'US'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: addressData }),  // Ensure proper format
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