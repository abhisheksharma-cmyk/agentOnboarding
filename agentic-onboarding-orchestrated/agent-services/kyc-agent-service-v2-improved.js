require("dotenv").config();
console.log("[KYC2 Startup] Checking GROQ_API_KEY environment variable. Has value: ", !!process.env.GROQ_API_KEY);
console.log("[KYC2 Startup] Checking GROQ_MODEL environment variable. Has value: ", !!process.env.GROQ_MODEL);
const express = require("express");
const { callGroq } = require("../groq/groqClient");

const app = express();
app.use(express.json({ limit: "5mb" }));

// Improved semantic extraction prompt
const EXTRACTION_SYSTEM_PROMPT = `You are an Expert Compliance Normalizer. Your task is to extract data from raw OCR text into a clean JSON format.

CRITICAL RULES:
1. Be Forgiving: If a value is present but formatted oddly (e.g., '5k' instead of '5000', or '01-Jan-80' instead of '1980-01-01'), you MUST normalize it to the standard format.
2. Confidence Scoring: Assign a confidence score between 0.0 and 1.0:
   - Use 1.0 if the data is clear and well-formatted
   - Use 0.7-0.8 if you had to 'guess' the normalization (e.g., correcting a typo)
   - Use 0.5-0.6 if the data is present but ambiguous
   - Use 0.0 ONLY if the data is truly missing
3. No Chat: Output ONLY the JSON. No preamble, no explanations, no markdown.

JSON SCHEMA:
{
  "documents": [
    {
      "index": number,
      "type": string,
      "number": string,
      "name": string,
      "dob": string,
      "gender": string,
      "address": string,
      "looks_authentic": boolean,
      "quality": "low" | "medium" | "high",
      "confidence": float,
      "extraction_notes": string
    }
  ],
  "summary_reasons": [string]
}`;

function normalize(str) {
    return (str || "").toString().trim().toLowerCase();
}

functio