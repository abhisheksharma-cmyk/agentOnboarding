require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json({ limit: "2mb" }));

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

function namesMatch(a, b) {
  if (!a || !b) return false;
  return normalize(a) === normalize(b);
}

function aadhaarLooksValid(num) {
  if (!AADHAAR_REGEX.test(num)) return false;
  if (/(.)\1{11}/.test(num)) return false; // reject same-digit repeats
  return verhoeffCheck(num);
}

function evaluateDocument(doc, applicant) {
  const type = normalize(doc.type);
  const number = (doc.number || doc.id || "").toString().trim();
  const docName = doc.name || doc.holder || doc.fullName || "";
  const docDob = doc.dob || doc.dateOfBirth || "";
  const docGender = doc.gender || doc.sex || "";
  const result = {
    score: 0,
    policyRefs: [],
    reasons: [],
    suspicious: false,
    missingData: false,
  };

  const applicantName = applicant?.name || applicant?.fullName || "";
  const applicantDob = applicant?.dob || applicant?.dateOfBirth || "";
  const applicantGender = applicant?.gender || applicant?.sex || "";

  const nameMatches = namesMatch(docName, applicantName);
  const dobMatches = normalizeDob(docDob) && normalizeDob(docDob) === normalizeDob(applicantDob);
  const genderMatches = normalize(docGender) && normalize(docGender) === normalize(applicantGender);

  const applyMatches = () => {
    if (nameMatches) result.score += 0.2;
    if (dobMatches) result.score += 0.1;
    if (genderMatches) result.score += 0.05;
  };

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
  const reasons = [];
  const policyRefs = new Set();
  let missingData = false;
  let policyConflict = false;
  let contradictory = false;

  const docResults = documents.map((doc) => {
    const res = evaluateDocument(doc, applicant);
    res.policyRefs.forEach((p) => policyRefs.add(p));
    if (res.missingData) missingData = true;
    if (res.suspicious) contradictory = true;
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

  let proposal = "escalate";
  if (hasStrong && !hasSuspicious) {
    proposal = "approve";
  } else if (!hasMinimal || hasSuspicious) {
    proposal = "escalate";
  }

  const confidence = Math.max(0.35, Math.min(0.9, hasStrong ? bestScore : bestScore - 0.1));

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
      agent_name: "mock_kyc_http",
      slot: "KYC",
      version: "1.1.0",
    },
  };
}

app.post("/agents/kyc/decide", (req, res) => {
  const payload = req.body?.input?.context?.payload || {};
  const applicant = payload.applicant || {};
  const documents = payload.documents || payload.docs || [];
  const decision = buildDecision({ applicant, documents });
  res.json(decision);
});

app.listen(5001, () => {
  console.log("Mock KYC Agent running on http://localhost:5001");
});
