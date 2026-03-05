const fetch = require("node-fetch");

const DEFAULT_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 10000);
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

/**
 * Normalizes common field formats in the parsed data.
 * Handles income, currency, percentages, etc.
 * @param data - The parsed JSON object
 * @returns Normalized data object
 */
function normalizeFields(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const normalized = { ...data };

  // Normalize income fields (e.g., "50k" -> 50000, "$1,234" -> 1234)
  const incomeFields = ['income', 'salary', 'annualIncome', 'monthlyIncome'];
  for (const field of incomeFields) {
    if (field in normalized && typeof normalized[field] === 'string') {
      const value = normalized[field]
        .toLowerCase()
        .replace(/k$/i, '000')        // "50k" -> "50000"
        .replace(/m$/i, '000000')     // "1m" -> "1000000"
        .replace(/[$,\s]/g, '');      // Remove $, commas, spaces

      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        normalized[field] = parsed;
      }
    }
  }

  // Normalize percentage fields (e.g., "85%" -> 0.85)
  const percentFields = ['confidence', 'score', 'match'];
  for (const field of percentFields) {
    if (field in normalized && typeof normalized[field] === 'string') {
      const value = normalized[field].replace(/%/g, '');
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        // If it's > 1, assume it's a percentage (85 -> 0.85)
        normalized[field] = parsed > 1 ? parsed / 100 : parsed;
      }
    }
  }

  // Normalize boolean strings
  const boolFields = ['verified', 'valid', 'approved', 'active'];
  for (const field of boolFields) {
    if (field in normalized && typeof normalized[field] === 'string') {
      const lower = normalized[field].toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') {
        normalized[field] = true;
      } else if (lower === 'false' || lower === 'no' || lower === '0') {
        normalized[field] = false;
      }
    }
  }

  // Recursively normalize nested objects
  for (const key in normalized) {
    if (normalized[key] && typeof normalized[key] === 'object' && !Array.isArray(normalized[key])) {
      normalized[key] = normalizeFields(normalized[key]);
    }
  }

  return normalized;
}

/**
 * Extracts and parses a JSON object from a raw string.
 * Handles markdown code blocks, extra text, nested braces, and truncated JSON.
 * Also normalizes common field formats (income, currency, etc.)
 * @param rawText - The raw response string from Groq.
 * @returns The parsed and normalized JSON object.
 * @throws Error if no valid JSON structure is found.
 */
function cleanGroqResponse(rawText) {
  const raw = (rawText || "").trim();
  if (!raw) {
    throw new Error("Empty response from model");
  }

  let parsedData = null;

  // Strategy 1: Try to find JSON within markdown code blocks
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      parsedData = JSON.parse(fencedMatch[1].trim());
    } catch (_err) {
      // Continue to next strategy
    }
  }

  // Strategy 2: Extract JSON object using regex (handles nested braces)
  if (!parsedData) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedData = JSON.parse(jsonMatch[0]);
      } catch (_err) {
        // Continue to next strategy
      }
    }
  }

  // Strategy 3: Find first { and matching closing } with brace counting
  if (!parsedData) {
    const firstBrace = raw.indexOf("{");
    if (firstBrace !== -1) {
      let braceCount = 0;
      let jsonEnd = -1;

      for (let i = firstBrace; i < raw.length; i++) {
        if (raw[i] === '{') braceCount++;
        if (raw[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }

      if (jsonEnd !== -1) {
        try {
          parsedData = JSON.parse(raw.slice(firstBrace, jsonEnd + 1));
        } catch (_err) {
          // Continue to next strategy
        }
      }
    }
  }

  // Strategy 4: Try parsing after stripping markdown artifacts
  if (!parsedData) {
    const stripped = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    if (stripped) {
      try {
        parsedData = JSON.parse(stripped);
      } catch (_err) {
        // Continue to next strategy
      }
    }
  }

  // Strategy 5: Handle truncated JSON by attempting to close it
  if (!parsedData) {
    const firstBrace = raw.indexOf("{");
    if (firstBrace !== -1) {
      let attempt = raw.slice(firstBrace);
      // Count open braces
      const openBraces = (attempt.match(/\{/g) || []).length;
      const closeBraces = (attempt.match(/\}/g) || []).length;

      // Add missing closing braces
      if (openBraces > closeBraces) {
        attempt += '}'.repeat(openBraces - closeBraces);
        try {
          parsedData = JSON.parse(attempt);
          console.log("[Groq Client] Successfully recovered truncated JSON");
        } catch (_err) {
          // Failed to recover
        }
      }
    }
  }

  if (!parsedData) {
    throw new Error("No valid JSON found in Groq response");
  }

  // Normalize common fields
  return normalizeFields(parsedData);
}

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

    // Enhance system prompt to be more restrictive
    const enhancedSystemPrompt = `${systemPrompt}

CRITICAL INSTRUCTIONS:
- Output ONLY valid JSON
- Do NOT include any introductory text, reasoning, or explanations
- Do NOT use markdown formatting or code blocks
- If a field is missing or unknown, use null
- If the document is a partial record (e.g., only 1 month of a bank statement), calculate the annual projection based on that month rather than marking it as missing
- Ensure the JSON is properly formatted and parseable`;

    const requestBody = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: "Return ONLY valid JSON following the contract. No markdown, no explanations." }
      ],
      temperature: 0, // Set to 0 for deterministic, factual output
      response_format: { type: "json_object" } // Force JSON mode
    };

    console.log("[Groq Client] Request body (model:", DEFAULT_MODEL, ", messages:", requestBody.messages.length, ")");
    console.log("[Groq Client] Temperature: 0 (deterministic mode)");
    console.log("[Groq Client] Response format: json_object");

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
      const parsed = cleanGroqResponse(content);
      console.log("[Groq Client] Successfully parsed JSON response");
      return parsed;
    } catch (err) {
      console.error("[Groq Client] Failed to parse JSON content:", content);
      console.error("[Groq Client] Parse error:", err.message);
      throw new Error(`Failed to parse Groq response: ${err.message}`);
    }
  } catch (err) {
    console.error("[Groq Client] Request failed:", err.message);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

module.exports = { callGroq };
