const fetch = require("node-fetch");

const DEFAULT_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 10000);
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function callGroq(systemPrompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",   // Updated to use the latest supported model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Return ONLY valid JSON following the contract." }
      ],
      temperature: 0
    })
  });

  const data = await response.json();

  // Extract assistant message
  const content = data?.choices?.[0]?.message?.content || "{}";
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Return ONLY valid JSON following the contract." }
        ],
        temperature: 0
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "{}";

    try {
      return JSON.parse(content);
    } catch (err) {
      console.error("Groq returned non-JSON content:", content);
      throw err;
    }
  } finally {
    clearTimeout(id);
  }
}

module.exports = { callGroq };
