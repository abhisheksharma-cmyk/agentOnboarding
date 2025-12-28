const fetch = require("node-fetch");

const DEFAULT_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 10000);
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function callGroq(systemPrompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  console.log("[Groq Client] callGroq called");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[Groq Client] ERROR: GROQ_API_KEY not set in environment");
    throw new Error("GROQ_API_KEY not set");
  }
  console.log("[Groq Client] API Key found (length:", apiKey.length, ")");
  console.log("[Groq Client] Using model:", DEFAULT_MODEL);
  console.log("[Groq Client] Timeout:", timeoutMs, "ms");

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log("[Groq Client] Making request to Groq API...");
    const requestBody = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Return ONLY valid JSON following the contract." }
      ],
      temperature: 0
    };
    console.log("[Groq Client] Request body (model:", DEFAULT_MODEL, ", messages:", requestBody.messages.length, ")");
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    console.log("[Groq Client] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const text = await response.text();
      console.error("[Groq Client] Error response:", text);
      throw new Error(`Groq HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    console.log("[Groq Client] Received content length:", content.length);
    console.log("[Groq Client] Content preview:", content.substring(0, 200));

    try {
      const parsed = JSON.parse(content);
      console.log("[Groq Client] Successfully parsed JSON response");
      return parsed;
    } catch (err) {
      console.error("[Groq Client] Failed to parse JSON content:", content);
      throw err;
    }
  } catch (err) {
    console.error("[Groq Client] Request failed:", err.message);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

module.exports = { callGroq };
