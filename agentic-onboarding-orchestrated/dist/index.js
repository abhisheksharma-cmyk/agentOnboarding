"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./bootstrap/loadEnv");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto = __importStar(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const orchestrator_1 = require("./orchestrator/orchestrator");
const onboardingWorkflow_1 = require("./workflows/onboardingWorkflow");
const eventBus_1 = require("./eventBus/eventBus");
const audit_1 = require("./auditTracking/audit");
const documentParser_1 = require("./utils/documentParser");
const addressAgent_1 = require("./agents/addressAgent");
const kycAgent_1 = require("./agents/kycAgent");
const agentRegistry_1 = require("./registry/agentRegistry");
const amlAgent_1 = require("./agents/amlAgent");
const creditAgent_1 = require("./agents/creditAgent");
const riskAgent_1 = require("./agents/riskAgent");
const decisionGateway_1 = require("./decisionGateway/decisionGateway");
const app = (0, express_1.default)();
// Enable CORS for all routes
app.use((0, cors_1.default)({
    origin: 'http://localhost:3000', // Your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Register agent endpoints
if (kycAgent_1.kycAgent && 'endpoints' in kycAgent_1.kycAgent && Array.isArray(kycAgent_1.kycAgent.endpoints)) {
    kycAgent_1.kycAgent.endpoints.forEach((endpoint) => {
        const method = endpoint.method.toLowerCase();
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const handlers = Array.isArray(endpoint.handler)
                ? endpoint.handler
                : [endpoint.handler];
            app[method](endpoint.path, ...handlers);
        }
    });
}
const chatSessions = new Map();
function requireSession(sessionId) {
    const session = chatSessions.get(sessionId);
    if (!session) {
        const err = new Error('Session not found');
        err.status = 404;
        throw err;
    }
    return session;
}
const uploadsRoot = path_1.default.join(process.cwd(), 'tmp', 'uploads');
fs_1.default.mkdirSync(uploadsRoot, { recursive: true });
// Utility functions
function maskAadhaar(aadhaar) {
    const digits = aadhaar.replace(/\D/g, '');
    if (digits.length !== 12)
        return aadhaar;
    return `XXXX-XXXX-${digits.slice(8)}`;
}
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (req, _file, cb) => {
            const sessionId = req.params?.id;
            const dir = sessionId ? path_1.default.join(uploadsRoot, sessionId) : uploadsRoot;
            fs_1.default.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (_req, file, cb) => {
            const id = crypto.randomUUID();
            const ext = path_1.default.extname(file.originalname) || '';
            cb(null, `${id}${ext}`);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
        if (!allowed.has(file.mimetype)) {
            return cb(new Error('Unsupported file type. Only PDF, PNG, JPG are allowed.'));
        }
        cb(null, true);
    }
});
/** In-memory store for run results keyed by traceId. */
const runResults = {};
function generateTraceId() {
    return (Date.now().toString(36) +
        "-" +
        Math.random().toString(36).substring(2, 10));
}
(0, orchestrator_1.initOrchestrator)();
eventBus_1.eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
    runResults[traceId] = data;
});
function sendError(res, err) {
    // eslint-disable-next-line no-console
    console.error("onboarding/start failed", err);
    return res.status(500).json({
        status: "error",
        message: err?.message || "Unexpected error",
    });
}
function buildContext(req, slot) {
    const body = req.body ?? {};
    const payload = (() => {
        if (typeof body.payload === "string") {
            try {
                return JSON.parse(body.payload);
            }
            catch {
                return {};
            }
        }
        return body.payload ?? {};
    })();
    const documentType = body.documentType || payload.documentType || null;
    const normalizedAddress = payload.address ||
        payload.applicant?.address ||
        body.address ||
        body.applicant?.address ||
        null;
    const normalizedApplicant = {
        ...(payload.applicant || {}),
        ...(body.applicant || {}),
        ...(normalizedAddress ? { address: normalizedAddress } : {}),
    };
    const sessionIdFromBody = body.sessionId || payload.sessionId;
    let extractedFieldsFromSession = null;
    let documentFromSession = null;
    if (sessionIdFromBody && typeof sessionIdFromBody === 'string') {
        const sess = chatSessions.get(sessionIdFromBody);
        if (sess) {
            console.log("[BuildContext] Session found for sessionId:", sessionIdFromBody);
            console.log("[BuildContext] Session slots content:", sess.slots);
            if (sess.slots && Object.keys(sess.slots).length > 0) {
                extractedFieldsFromSession = { ...sess.slots };
                const docAddress = sess.slots.address ||
                    normalizedAddress ||
                    payload.address ||
                    body.address ||
                    null;
                documentFromSession = {
                    fullName: sess.slots.fullName,
                    gender: sess.slots.gender,
                    dateOfBirth: sess.slots.dateOfBirth,
                    address: docAddress
                };
                console.log("[BuildContext] documentFromSession constructed:", documentFromSession);
            }
            else {
                console.log("[BuildContext] Session slots are empty or null.");
            }
        }
        else {
            console.log("[BuildContext] Session NOT found for sessionId:", sessionIdFromBody);
        }
    }
    return {
        customerId: body.customerId || "cus_demo",
        applicationId: body.applicationId || "ca_demo",
        slot,
        payload: {
            ...payload,
            documentType,
            riskProfile: body.riskProfile || payload.riskProfile || body.risk_tolerance || payload.risk_tolerance || "low",
            agentSelection: body.agentSelection || payload.agentSelection || {},
            documents: documentFromSession ? [documentFromSession, ...(Array.isArray(payload.documents) ? payload.documents : [])] : (payload.documents || []),
            extractedFields: extractedFieldsFromSession || payload.extractedFields,
            applicant: normalizedApplicant,
            ...(normalizedAddress ? { address: normalizedAddress } : {}),
        },
    };
}
async function waitForResult(traceId, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (runResults[traceId]) {
            return { status: "completed", result: runResults[traceId] };
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return { status: "pending", result: null };
}
app.post('/chat/session/start', (_req, res) => {
    const id = crypto.randomUUID();
    const assistantMessage = {
        role: 'assistant',
        text: 'Hi! You can describe your details here or upload your Aadhaar (PDF/image) to autofill. What would you like to do? ',
        ts: Date.now()
    };
    const session = {
        id,
        createdAt: Date.now(),
        messages: [assistantMessage],
        slots: {},
        attachments: [],
        pendingConfirmation: null
    };
    chatSessions.set(id, session);
    res.json({ sessionId: id, assistantMessage: assistantMessage.text });
});
app.post('/chat/session/:id/message', (req, res, next) => {
    try {
        const session = requireSession(req.params.id);
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        session.messages.push({ role: 'user', text, ts: Date.now() });
        const reply = 'Got it. You can upload your Aadhaar anytime, or share your name, DOB, and address here.';
        session.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
        res.json({ assistantMessage: reply, sessionId: session.id });
    }
    catch (err) {
        next(err);
    }
});
app.post('/chat/session/:id/upload', upload.single('file'), async (req, res, next) => {
    try {
        const session = requireSession(req.params.id);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'file is required' });
        }
        const attachmentId = path_1.default.parse(file.filename).name;
        const attachment = {
            id: attachmentId,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            filePath: file.path,
            uploadedAt: Date.now()
        };
        session.attachments.push(attachment);
        const started = Date.now();
        let extractedText = '';
        try {
            if (attachment.mimeType === 'application/pdf') {
                extractedText = await (0, documentParser_1.extractTextFromPdf)(attachment.filePath);
            }
            else {
                extractedText = await (0, documentParser_1.extractTextFromImage)(attachment.filePath);
            }
        }
        catch (e) {
            extractedText = '';
        }
        const fields = (0, documentParser_1.parseDocumentFields)(extractedText);
        const extractedTextPreview = extractedText.slice(0, 600);
        const hasAnyField = Object.keys(fields).length > 0;
        session.pendingConfirmation = hasAnyField ? fields : null;
        const durationMs = Date.now() - started;
        const reply = hasAnyField
            ? `I extracted details from your ${fields.idType || 'document'} (took ${durationMs}ms). Please confirm below.`
            : `I received ${file.originalname}, but couldn’t reliably extract details. You can enter them manually in chat.`;
        session.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
        res.json({
            attachmentId: attachment.id,
            fileName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            assistantMessage: reply,
            pendingConfirmation: session.pendingConfirmation,
            extractedTextPreview: extractedTextPreview
        });
    }
    catch (err) {
        next(err);
    }
});
app.post('/chat/session/:id/confirm', (req, res, next) => {
    try {
        const session = requireSession(req.params.id);
        const confirmed = Boolean(req.body?.confirmed);
        const corrections = req.body?.corrections && typeof req.body.corrections === 'object' ? req.body.corrections : null;
        if (confirmed) {
            const toMerge = {
                ...(session.pendingConfirmation || {}),
                ...(corrections || {})
            };
            session.slots = { ...session.slots, ...toMerge };
            session.pendingConfirmation = null;
        }
        else {
            session.pendingConfirmation = null;
        }
        const reply = confirmed ? 'Thanks — confirmed. I’ve saved these details.' : 'No problem — please tell me the correct details.';
        session.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
        res.json({ assistantMessage: reply, slots: session.slots });
    }
    catch (err) {
        next(err);
    }
});
app.post('/onboarding/verify-address', async (req, res) => {
    console.log('Received address verification request:', JSON.stringify(req.body, null, 2));
    const { address } = req.body;
    if (!address || !address.line1) {
        console.log('Invalid request: Missing address or address.line1');
        return res.status(400).json({
            error: 'Address is required with at least line1'
        });
    }
    try {
        console.log('Processing address verification for:', address);
        const result = await (0, addressAgent_1.runAddressAgent)({
            customerId: 'temp-customer',
            applicationId: 'temp-application',
            slot: 'ADDRESS_VERIFICATION',
            payload: {
                address: {
                    line1: address.line1,
                    city: address.city || '',
                    state: address.state || '',
                    postalCode: address.postalCode || '',
                    country: address.country || ''
                }
            }
        });
        console.log('Address verification result:', result);
        res.json(result);
    }
    catch (error) {
        console.error('Error in address verification:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        res.status(500).json({
            error: 'Failed to verify address',
            details: errorMessage
        });
    }
});
/**
 * Start a full onboarding run.
 * Returns traceId immediately and, after a short wait, the final result + audit trail (or pending).
 */
app.post("/onboarding/start", async (req, res) => {
    try {
        const traceId = generateTraceId();
        const ctx = buildContext(req, "KYC");
        (0, onboardingWorkflow_1.startOnboarding)(ctx, traceId);
        const { status, result } = await waitForResult(traceId);
        const auditTrail = (0, audit_1.getTrace)(traceId);
        return res.json({ traceId, status, result, auditTrail });
    }
    catch (err) {
        return sendError(res, err);
    }
});
/** Fetch audit trail and result for a given traceId (idempotent/async-safe). */
app.get("/onboarding/trace/:traceId", (req, res) => {
    const traceId = req.params.traceId;
    const result = runResults[traceId] || null;
    const auditTrail = (0, audit_1.getTrace)(traceId);
    // Extract final decision from result for easier access
    const finalDecision = result?.final || result?.data?.final || null;
    res.json({
        traceId,
        status: result ? "completed" : "pending",
        result,
        finalDecision, // Add finalDecision at top level for easier access
        auditTrail,
    });
});
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Agentic Onboarding Reference" });
});
app.get("/config/agents", (_req, res) => {
    try {
        const agents = (0, agentRegistry_1.loadAgentsConfig)();
        const active = (0, agentRegistry_1.getActiveAgents)();
        const profilePath = process.env.AGENTS_CONFIG_PATH || path_1.default.join(process.cwd(), "config", "agents.yaml");
        res.json({ profilePath, agents, active });
    }
    catch (err) {
        res.status(500).json({
            error: "Failed to load agents configuration",
            message: err?.message || "Unexpected error"
        });
    }
});
app.post("/test/kyc", async (req, res) => {
    const ctx = buildContext(req, "KYC");
    const out = await (0, kycAgent_1.runKycAgent)(ctx);
    // Ensure the proposal is always defined
    const agentOutput = {
        ...out,
        proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
        confidence: out.confidence || 0,
        reasons: out.reasons || [],
        policy_refs: out.policy_refs || [],
        flags: out.flags || {}
    };
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(agentOutput, ctx);
    res.json({ agentOutput, finalDecision });
});
app.post("/test/aml", async (req, res) => {
    const ctx = buildContext(req, "AML");
    const out = await (0, amlAgent_1.runAmlAgent)(ctx);
    // Ensure the proposal is always defined
    const agentOutput = {
        ...out,
        proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
        confidence: out.confidence || 0,
        reasons: out.reasons || [],
        policy_refs: out.policy_refs || [],
        flags: out.flags || {}
    };
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(agentOutput, ctx);
    res.json({ agentOutput, finalDecision });
});
app.post("/test/credit", async (req, res) => {
    const ctx = buildContext(req, "CREDIT");
    const out = await (0, creditAgent_1.runCreditAgent)(ctx);
    // Ensure the proposal is always defined
    const agentOutput = {
        ...out,
        proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
        confidence: out.confidence || 0,
        reasons: out.reasons || [],
        policy_refs: out.policy_refs || [],
        flags: out.flags || {}
    };
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(agentOutput, ctx);
    res.json({ agentOutput, finalDecision });
});
app.post("/test/risk", async (req, res) => {
    const ctx = buildContext(req, "RISK");
    const out = await (0, riskAgent_1.runRiskAgent)(ctx);
    // Ensure the proposal is always defined
    const agentOutput = {
        ...out,
        proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
        confidence: out.confidence || 0,
        reasons: out.reasons || [],
        policy_refs: out.policy_refs || [],
        flags: out.flags || {}
    };
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(agentOutput, ctx);
    res.json({ agentOutput, finalDecision });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
