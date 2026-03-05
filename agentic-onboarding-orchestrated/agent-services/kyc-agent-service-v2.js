require("dotenv").config();
console.log("[KYC2 Startup] Checking GROQ_API_KEY environment variable. Has value: ", !!process.env.GROQ_API_KEY);
console.log("[KYC2 Startup] Checking GROQ_MODEL environment variable. Has value: ", !!process.env.GROQ_MODEL);
const express = require("express");
const { callGroq } = require("../groq/groqClient");

const app = express();
app.use(express.json({ limit: "5mb" }));

// Lightweight PAN/Aadhaar heuristics reused from mock-kyc-agent
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const AADHAAR_REGEX = /^\d{12}$/;

const verhoeffD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const verhoeffP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffCheck(num) {
  let c = 0;
  const digits = String(num).split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = verhoeffD[c][verhoeffP[i % 8][digits[i]]];
  }
  return c === 0;
}

function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

function normalizeDob(dob) {
  return (dob || "").replace(/[^0-9]/g, "").slice(0, 8);
}

const namesMatch = (a, b) => !!a && !!b && normalize(a) === normalize(b);

function tokenizeName(name) {
  return normalize(name)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isInitialToken(token) {
  return /^[a-z]$/.test(token);
}

function getNameMatchType(docName, applicantName) {
  if (!docName || !applicantName) return "unknown";
  if (namesMatch(docName, applicantName)) return "exact";

  const docTokens = tokenizeName(docName);
  const applicantTokens = tokenizeName(applicantName);

  if (!docTokens.length || !applicantTokens.length) return "mismatch";
  if (docTokens.length !== applicantTokens.length) return "mismatch";

  let usedInitials = false;

  for (let i = 0; i < docTokens.length; i++) {
    const dt = docTokens[i];
    const at = applicantTokens[i];

    if (dt === at) continue;
    if (isInitialToken(dt) && at.startsWith(dt)) {
      usedInitials = true;
      continue;
    }
    return "mismatch";
  }

  return usedInitials ? "initials" : "mismatch";
}

function aadhaarLooksValid(num) {
  if (!AADHAAR_REGEX.test(num)) return false;
  if (/(.)\1{11}/.test(num)) return false; // reject same-digit repeats
  return verhoeffCheck(num);
}

function buildApplicantFields(applicant) {
  return {
    name: applicant?.name || applicant?.fullName || "",
    dob: applicant?.dob || applicant?.dateOfBirth || "",
    gender: applicant?.gender || applicant?.sex || "",
  };
}

async function runGroqExtraction(applicant, documents) {
  console.log("[Groq] Starting extraction for applicant:", applicant);
  console.log("[Groq] Documents to process:", documents.length);

  const payload = { applicant, documents };
  const systemPrompt = `You are a KYC document extraction agent. Given applicant info and an array of documents (may include text, base64, or fields), extract key identity fields. Return ONLY valid JSON.
Input JSON: ${JSON.stringify(payload)}
Schema:
{
  "documents": [
    {
      "index": number, // index from input array
      "type": string,
      "number": string,
      "name": string,
      "dob": string,
      "gender": string,
      "looks_authentic": boolean,
      "quality": "low" | "medium" | "high",
      "reasons": [string]
    }
  ],
  "summary_reasons": [string]
}
If unknown, return "" for strings and [] for arrays.`;
  try {
    console.log("[Groq] Calling callGroq with system prompt (length:", systemPrompt.length, ")");
    const out = await callGroq(systemPrompt);
    console.log("[Groq] Successfully received response from Groq");
    return out;
  } catch (err) {
    console.error("[Groq] Extraction failed:", err.message);
    console.error("[Groq] Error details:", err);
    return { documents: [], summary_reasons: ["Groq extraction failed: " + err.message] };
  }
}

function evaluateDocument(doc, applicant, riskTolerance = "medium") {
  const type = normalize(doc.type);
  const number = (doc.number || doc.id || "").toString().trim();
  const docName = doc.name || doc.holder || doc.fullName || "";
  const docDob = doc.dob || doc.dateOfBirth || "";
  const docGender = doc.gender || doc.sex || "";
  const looksAuthentic = doc.looks_authentic === true;
  const quality = doc.quality || "";
  const result = {
    score: 0,
    policyRefs: [],
    reasons: [],
    suspicious: false,
    missingData: false,
    policyConflict: false,
    nameMatchType: "unknown",
    matchedFields: 0,
    totalFields: 0,
  };

  const applicantFields = buildApplicantFields(applicant);
  const applicantName = applicantFields.name;
  const applicantDob = applicantFields.dob;
  const applicantGender = applicantFields.gender;

  const nameMatchType = getNameMatchType(docName, applicantName);
  result.nameMatchType = nameMatchType;
  const dobMatches = normalizeDob(docDob) && normalizeDob(docDob) === normalizeDob(applicantDob);
  const genderMatches = normalize(docGender) && normalize(docGender) === normalize(applicantGender);

  // Track matched fields
  result.totalFields = 3; // name, dob, gender
  if (nameMatchType === "exact" || nameMatchType === "initials") result.matchedFields++;
  if (dobMatches) result.matchedFields++;
  if (genderMatches) result.matchedFields++;

  const applyMatches = () => {
    if (nameMatchType === "exact") {
      result.score += 0.2;
    } else if (nameMatchType === "initials") {
      if (riskTolerance === "high") {
        result.score += 0.15;
        result.reasons.push("Name matched by initials (high risk tolerance)");
      } else if (riskTolerance === "low") {
        result.reasons.push("Name only matches by initials (low risk tolerance)");
        result.policyConflict = true;
        result.suspicious = true;
      } else {
        result.reasons.push("Name only matches by initials");
        result.suspicious = true;
      }
    } else if (nameMatchType === "mismatch") {
      result.reasons.push("Name mismatch between applicant and document");
      if (riskTolerance === "low") {
        result.policyConflict = true;
      }
      result.suspicious = true;
    }
    if (dobMatches) result.score += 0.1;
    if (genderMatches) result.score += 0.05;
  };

  if (looksAuthentic) {
    result.score += 0.1;
  } else if (doc.looks_authentic === false) {
    result.reasons.push("Document marked low authenticity by LLM extractor");
    result.suspicious = true;
  }

  if (quality === "high") result.score += 0.05;
  if (quality === "low") result.reasons.push("Low document quality from extractor");

  if (!number) {
    result.reasons.push("Document is missing an ID number");
    result.missingData = true;
  }

  if (type.includes("pan")) {
    result.policyRefs.push("POLICY-KYC-PAN-01");
    if (PAN_REGEX.test(number)) {
      result.score += 0.45;
    } else {
      result.reasons.push("PAN number failed format check");
      result.suspicious = true;
    }
    applyMatches();
  } else if (type.includes("aadhaar") || type.includes("adhar") || type === "uid") {
    result.policyRefs.push("POLICY-KYC-AADHAAR-01");
    if (aadhaarLooksValid(number)) {
      result.score += 0.45;
    } else {
      result.reasons.push("Aadhaar number failed length/checksum/entropy checks");
      result.suspicious = true;
    }
    applyMatches();
  } else {
    result.policyRefs.push("POLICY-KYC-DOC-GEN-01");
    if (number) {
      result.score += 0.25;
    }
    if (docName) result.score += 0.05;
    applyMatches();
  }

  result.score = Math.min(1, result.score);
  return result;
}

function buildDecision({ applicant, documents }) {
  const riskTolerance = normalize(applicant?.risk_tolerance || applicant?.riskTolerance || "low");
  const reasons = [];
  const policyRefs = new Set();
  let missingData = false;
  let policyConflict = false;
  let contradictory = false;
  let matchedFields = 0;
  let consideredFields = 0;

  const docResults = documents.map((doc) => {
    const res = evaluateDocument(doc, applicant, riskTolerance);
    res.policyRefs.forEach((p) => policyRefs.add(p));
    if (res.missingData) missingData = true;
    if (res.policyConflict) policyConflict = true;
    if (res.suspicious) contradictory = true;
    matchedFields += res.matchedFields;
    consideredFields += res.totalFields;
    reasons.push(...res.reasons);
    return res;
  });

  if (!documents.length) {
    missingData = true;
    reasons.push("No identity documents provided");
  }

  const bestScore = docResults.reduce((max, r) => Math.max(max, r.score), 0);
  const hasStrong = bestScore >= 0.75;
  const hasSuspicious = docResults.some((r) => r.suspicious);
  const hasMinimal = documents.length > 0 && bestScore >= 0.35;
  const hasInitialsOnly = docResults.some((r) => r.nameMatchType === "initials");

  let proposal = "escalate";
  if (riskTolerance === "low" && (policyConflict || hasSuspicious)) {
    proposal = "deny";
  } else if (hasStrong && !hasSuspicious) {
    proposal = "approve";
  } else if (riskTolerance === "high") {
    // HIGH risk tolerance: More lenient approval logic
    if (hasMinimal && !policyConflict) {
      proposal = "approve";
      reasons.push("Approved with HIGH risk tolerance (minimal data present)");
    } else if (hasInitialsOnly && !hasSuspicious) {
      proposal = "approve";
      reasons.push("Approved with HIGH risk tolerance (name matched by initials)");
    }
  } else if (!hasMinimal || hasSuspicious) {
    proposal = "escalate";
  }

  let confidence = Math.max(0.4, Math.min(0.95, hasStrong ? bestScore : bestScore - 0.05));

  // Adjust confidence based on risk tolerance and proposal
  if (proposal === "deny" && confidence < 0.85) confidence = 0.85;
  if (riskTolerance === "high" && proposal === "approve") {
    // For HIGH risk tolerance approvals, ensure confidence is at least 0.5
    confidence = Math.max(0.5, confidence);
  }
  if (riskTolerance === "low" && proposal === "escalate" && confidence > 0.7) confidence = 0.7;

  return {
    proposal,
    confidence,
    reasons: reasons.length ? reasons : ["Automated KYC mock evaluation"],
    policy_refs: Array.from(policyRefs),
    flags: {
      missing_data: missingData,
      policy_conflict: policyConflict,
      provider_high_risk: false,
      contradictory_signals: hasSuspicious || contradictory,
    },
    metadata: {
      agent_name: "mock_kyc2_http",
      slot: "KYC",
      version: "2.0.0",
    },
  };
}

app.post("/agents/kyc2/decide", async (req, res) => {
  console.log("[KYC2] Received request at /agents/kyc2/decide");
  console.log("[KYC2] Request body:", JSON.stringify(req.body, null, 2));

  const payload = req.body?.input?.context?.payload || {};
  const riskTolerance = normalize(payload?.risk_tolerance || payload?.riskTolerance || "medium");
  const applicant = {
    ...(payload.applicant || {}),
    risk_tolerance: riskTolerance
  };
  const documents = payload.documents || payload.docs || [];
  const documentType = payload.documentType || documents[0]?.type || 'unknown';

  console.log("[KYC2] Extracted - applicant:", applicant);
  console.log("[KYC2] Extracted - documents count:", documents.length);
  console.log("[KYC2] Document type:", documentType);

  console.log("[KYC2] Calling Groq extraction...");
  const groqOut = await runGroqExtraction(applicant, documents);
  console.log("[KYC2] Groq extraction result:", JSON.stringify(groqOut, null, 2));

  const extractedDocs = groqOut?.documents || [];
  const mergedDocs = documents.map((doc, idx) => {
    const extracted = extractedDocs.find((d) => d.index === idx) || extractedDocs[idx] || {};
    return {
      ...doc,
      ...extracted,
      type: extracted.type || doc.type || documentType // Ensure type is set
    };
  });

  // Validate each document based on its type
  const validationResults = mergedDocs.map((doc) => {
    const docType = normalize(doc.type || documentType);
    let validation = {
      isValid: true,
      errors: [],
      confidence: 0.5
    };

    // Apply type-specific validation
    if (docType.includes('passport')) {
      if (!doc.number || !/^[A-Z0-9]{8,9}$/i.test(doc.number)) {
        validation.errors.push('Invalid passport number format');
        validation.isValid = false;
      }
      if (!doc.name) validation.errors.push('Name is required');
      if (!doc.dob) validation.errors.push('Date of birth is required');
      if (!doc.expiryDate) validation.errors.push('Expiry date is required');
      if (doc.expiryDate && new Date(doc.expiryDate) < new Date()) {
        validation.errors.push('Passport has expired');
        validation.isValid = false;
      }
    } else if (docType.includes('driver') || docType.includes('license')) {
      if (!doc.number || !/^[A-Z0-9]{8,16}$/i.test(doc.number)) {
        validation.errors.push('Invalid driver\'s license number format');
        validation.isValid = false;
      }
      if (!doc.name) validation.errors.push('Name is required');
      if (!doc.dob) validation.errors.push('Date of birth is required');
    } else if (docType.includes('aadhaar') || docType.includes('adhar') || docType === 'uid') {
      if (!doc.number || !/^\d{12}$/.test(doc.number)) {
        validation.errors.push('Aadhaar number must be exactly 12 digits');
        validation.isValid = false;
      } else if (!aadhaarLooksValid(doc.number)) {
        validation.errors.push('Invalid Aadhaar number checksum');
        validation.isValid = false;
      }
      if (!doc.name) validation.errors.push('Name is required');
      if (!doc.dob) validation.errors.push('Date of birth is required');
    } else if (docType.includes('utility')) {
      if (!doc.address || doc.address.length < 10) {
        validation.errors.push('Address is required and must be complete');
        validation.isValid = false;
      }
      if (!doc.name) validation.errors.push('Account holder name is required');
      if (!doc.issueDate) validation.errors.push('Bill date is required');
      if (doc.issueDate && new Date(doc.issueDate) < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
        validation.errors.push('Utility bill is older than 3 months');
        validation.isValid = false;
      }
    } else if (docType.includes('bank') || docType.includes('statement')) {
      if (!doc.number || !/^[0-9]{8,18}$/.test(doc.number)) {
        validation.errors.push('Invalid bank account number format');
        validation.isValid = false;
      }
      if (!doc.name) validation.errors.push('Account holder name is required');
      if (!doc.address || doc.address.length < 10) {
        validation.errors.push('Address is required and must be complete');
        validation.isValid = false;
      }
      if (!doc.issueDate) validation.errors.push('Statement date is required');
      if (doc.issueDate && new Date(doc.issueDate) < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
        validation.errors.push('Bank statement is older than 3 months');
        validation.isValid = false;
      }
    }

    // Calculate confidence based on validation
    const requiredFields = ['number', 'name'];
    const presentFields = requiredFields.filter(f => doc[f]);
    validation.confidence = presentFields.length / requiredFields.length;
    if (doc.quality === 'high') validation.confidence += 0.2;
    if (doc.looks_authentic === true) validation.confidence += 0.1;

    return { ...doc, validation };
  });

  // Add validation errors to decision reasons
  const allValidationErrors = validationResults.flatMap(r => r.validation?.errors || []);
  const hasInvalidDocs = validationResults.some(r => !r.validation?.isValid);

  const decision = buildDecision({ applicant, documents: mergedDocs });

  // Add validation-specific reasons
  if (allValidationErrors.length > 0) {
    decision.reasons = [...allValidationErrors, ...decision.reasons];
  }

  if (hasInvalidDocs && decision.proposal !== 'deny') {
    decision.proposal = 'escalate';
    decision.confidence = Math.min(decision.confidence, 0.5);
    decision.flags.missing_data = true;
  }

  if (groqOut?.summary_reasons?.length) {
    decision.reasons = [...groqOut.summary_reasons, ...decision.reasons];
  }

  // Add validation metadata
  decision.metadata = {
    ...decision.metadata,
    documentType: documentType,
    riskTolerance: riskTolerance,
    validationResults: validationResults.map(r => ({
      type: r.type,
      isValid: r.validation?.isValid,
      confidence: r.validation?.confidence,
      errors: r.validation?.errors
    }))
  };

  console.log("[KYC2] Final decision:", JSON.stringify(decision, null, 2));
  res.json(decision);
});

app.listen(5005, () => {
  console.log("Mock KYC2 Agent (LLM extraction) running on http://localhost:5005");
});
