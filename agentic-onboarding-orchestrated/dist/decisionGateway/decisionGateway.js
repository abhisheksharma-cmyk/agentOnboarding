"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateDecision = evaluateDecision;
/**
 * Central place to enforce decision boundaries.
 * Agents can propose, but this function is the final authority.
 */
function evaluateDecision(out, ctx) {
    const riskProfile = normalizeRisk((ctx?.payload?.riskProfile ??
        ctx?.payload?.risk_tolerance ??
        ctx?.payload?.applicant?.riskProfile ??
        "").toString());
    const docMatch = ctx ? documentMatchesApplication(ctx, out, riskProfile) : false;
    const flags = out.flags ?? {};
    // New business rule overrides:
    // - If user selects High Risk and uploaded document info matches the application => APPROVE
    // - If user selects Low Risk => ESCALATE (manual review)
    console.log(`[DecisionGateway] Evaluating decision: riskProfile=${riskProfile}, docMatch=${docMatch}`);
    if (riskProfile === "high" && docMatch) {
        return "APPROVE";
    }
    if (riskProfile === "low") {
        return "ESCALATE";
    }
    // Global, conservative rules
    if (out.confidence < 0.8)
        return "ESCALATE";
    if (!out.flags)
        return "ESCALATE";
    if (flags.missing_data)
        return "ESCALATE";
    if (flags.policy_conflict)
        return "DENY";
    if (flags.provider_high_risk)
        return "DENY";
    if (flags.contradictory_signals)
        return "ESCALATE";
    // Default: follow proposal
    switch (out.proposal) {
        case "approve":
            return "APPROVE";
        case "deny":
            return "DENY";
        case "escalate":
        default:
            return "ESCALATE";
    }
}
function normalizeRisk(val) {
    const s = (val || "").toLowerCase().trim();
    if (s.includes("high"))
        return "high";
    if (s.includes("low"))
        return "low";
    return "";
}
function normalizeString(val) {
    if (val == null)
        return "";
    return String(val).toLowerCase().trim();
}
function normalizeDate(val) {
    if (!val)
        return "";
    // Accept common formats and normalize as YYYY-MM-DD if parsable
    try {
        const v = String(val).trim();
        // Already ISO-like
        if (/^\d{4}-\d{2}-\d{2}$/.test(v))
            return v;
        // DD/MM/YYYY or DD-MM-YYYY
        const m = v.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
        if (m) {
            const [_, dd, mm, yyyy] = m;
            return `${yyyy}-${mm}-${dd}`;
        }
        // Fallback to Date parsing
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
        }
    }
    catch {
        // ignore
    }
    return normalizeString(val);
}
function documentMatchesApplication(ctx, out, risk) {
    const applicant = ctx?.payload?.applicant ?? ctx?.payload ?? {};
    const documents = Array.isArray(ctx?.payload?.documents) ? ctx.payload.documents : [];
    const doc = ctx?.payload?.document ?? ctx?.payload?.documentFields ?? documents[0] ?? {};
    const appName = normalizeString(applicant.fullName ?? applicant.name ?? applicant.full_name);
    const appGender = normalizeString(applicant.gender);
    const appDob = normalizeDate(applicant.dateOfBirth ?? applicant.dob);
    // Address may be object or string
    const appAddressObj = applicant.address ?? ctx?.payload?.address ?? {};
    const appAddress = typeof appAddressObj === "string"
        ? normalizeString(appAddressObj)
        : normalizeString([
            appAddressObj.line1,
            appAddressObj.line2,
            appAddressObj.city,
            appAddressObj.state,
            appAddressObj.postalCode,
            appAddressObj.country,
        ].filter(Boolean).join(", "));
    const docName = normalizeString(doc.fullName ?? doc.name ?? (ctx?.payload?.extractedFields?.fullName));
    const docGender = normalizeString(doc.gender ?? (ctx?.payload?.extractedFields?.gender));
    const docDob = normalizeDate(doc.dateOfBirth ?? doc.dob ?? (ctx?.payload?.extractedFields?.dateOfBirth));
    // Document address: try verified_address from agent metadata or doc fields
    const verifiedAddress = normalizeString(out?.metadata?.verified_address ?? out?.verified_address);
    const docAddressObj = doc.address ?? {};
    const docAddress = verifiedAddress ||
        (typeof docAddressObj === "string"
            ? normalizeString(docAddressObj)
            : normalizeString([
                docAddressObj.line1,
                docAddressObj.line2,
                docAddressObj.city,
                docAddressObj.state,
                docAddressObj.postalCode,
                docAddressObj.country,
            ].filter(Boolean).join(", ")));
    // Name matching: allow initials equivalence when risk is high
    const nameMatch = !!appName &&
        !!docName &&
        (appName === docName || (risk === "high" && namesMatchWithInitials(docName, appName)));
    const genderMatch = !!appGender && !!docGender && appGender === docGender;
    const dobMatch = !!appDob && !!docDob && appDob === docDob;
    // Address: if document address not present, don't block the match
    let addrMatch = true;
    if (!!docAddress) { // Only require address match if document provides an address
        addrMatch = !!appAddress && (appAddress.includes(docAddress) || docAddress.includes(appAddress));
    }
    console.log("[DecisionGateway] --- Document Match Analysis ---");
    console.log("[DecisionGateway] Applicant Name:", appName);
    console.log("[DecisionGateway] Document Name:", docName);
    console.log("[DecisionGateway] Name Match:", nameMatch);
    console.log("[DecisionGateway] Applicant Gender:", appGender);
    console.log("[DecisionGateway] Document Gender:", docGender);
    console.log("[DecisionGateway] Gender Match:", genderMatch);
    console.log("[DecisionGateway] Applicant DOB:", appDob);
    console.log("[DecisionGateway] Document DOB:", docDob);
    console.log("[DecisionGateway] DOB Match:", dobMatch);
    console.log("[DecisionGateway] Applicant Address:", appAddress);
    console.log("[DecisionGateway] Document Address:", docAddress);
    console.log("[DecisionGateway] Address Match:", addrMatch);
    console.log("[DecisionGateway] Final Document Match Result:", nameMatch && genderMatch && dobMatch && addrMatch);
    console.log("[DecisionGateway] ---------------------------------");
    return nameMatch && genderMatch && dobMatch && addrMatch;
}
function namesMatchWithInitials(docName, applicantName) {
    const dt = tokenizeName(docName);
    const at = tokenizeName(applicantName);
    if (!dt.length || !at.length)
        return false;
    if (dt.length !== at.length)
        return false;
    for (let i = 0; i < dt.length; i++) {
        if (dt[i] === at[i])
            continue;
        if (isInitialToken(dt[i]) && at[i].startsWith(dt[i]))
            continue;
        return false;
    }
    return true;
}
function tokenizeName(name) {
    return (name || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}
function isInitialToken(token) {
    return /^[a-z]$/.test(token || "");
}
