const fetch = require("node-fetch");

async function callGroq(systemPrompt) {
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

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("Groq returned non-JSON content:", content);
    throw err;
  }
}

module.exports = { callGroq };
