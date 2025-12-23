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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto = __importStar(require("crypto"));
const multer = require("multer");
const orchestrator_1 = require("./orchestrator/orchestrator");
const onboardingWorkflow_1 = require("./workflows/onboardingWorkflow");
const eventBus_1 = require("./eventBus/eventBus");
const audit_1 = require("./auditTracking/audit");
const addressAgent_1 = require("./agents/addressAgent");
const kycAgent_1 = require("./agents/kycAgent");
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
app.use(express_1.default.json());
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
function maskAadhaar(aadhaar) {
    const digits = aadhaar.replace(/\D/g, '');
    if (digits.length !== 12)
        return aadhaar;
    return `XXXX-XXXX-${digits.slice(8)}`;
}
async function extractTextFromPdf(filePath) {
    const pdfParse = require('pdf-parse');
    const buf = fs_1.default.readFileSync(filePath);
    const out = await pdfParse(buf);
    return out?.text || '';
}
async function extractTextFromImage(filePath) {
    const tesseract = require('tesseract.js');
    const worker = await tesseract.createWorker('eng');
    const result = await worker.recognize(filePath);
    await worker.terminate();
    return result?.data?.text || '';
}
function parseAadhaarFieldsFromText(rawText) {
    const text = (rawText || '').replace(/\r/g, '');
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    const joined = lines.join('\n');
    const aadhaarMatch = joined.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
    const aadhaarNumber = aadhaarMatch ? aadhaarMatch[1].replace(/\s+/g, '') : null;
    const dobMatch = joined.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    const yobMatch = joined.match(/\b(19\d{2}|20\d{2})\b/);
    const dateOfBirth = dobMatch ? dobMatch[1] : null;
    const yearOfBirth = !dateOfBirth && yobMatch ? yobMatch[1] : null;
    const genderMatch = joined.match(/\b(MALE|FEMALE|TRANSGENDER)\b/i);
    const gender = genderMatch ? genderMatch[1].toUpperCase() : null;
    let fullName = null;
    const dobLineIndex = lines.findIndex(l => /\bDOB\b|\bDate of Birth\b|\bYear of Birth\b|\bYOB\b/i.test(l) || /\b\d{2}\/\d{2}\/\d{4}\b/.test(l));
    const blacklist = new Set([
        'GOVERNMENT OF INDIA',
        'GOVT OF INDIA',
        'UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
        'UIDAI',
        'AADHAAR',
        'DOB',
        'DATE OF BIRTH',
        'YEAR OF BIRTH',
        'MALE',
        'FEMALE',
        'TRANSGENDER'
    ]);
    const looksLikeName = (s) => {
        const up = s.toUpperCase();
        if (blacklist.has(up))
            return false;
        if (/\d/.test(s))
            return false;
        if (s.length < 3)
            return false;
        if (!/^[A-Za-z .']+$/.test(s))
            return false;
        return true;
    };
    if (dobLineIndex > 0) {
        for (let i = dobLineIndex - 1; i >= 0; i -= 1) {
            if (looksLikeName(lines[i])) {
                fullName = lines[i];
                break;
            }
        }
    }
    if (!fullName) {
        const nameLabelIndex = lines.findIndex(l => /^name\s*:/i.test(l));
        if (nameLabelIndex !== -1) {
            const labelLine = lines[nameLabelIndex];
            const after = labelLine.split(':').slice(1).join(':').trim();
            if (after && looksLikeName(after)) {
                fullName = after;
            }
            else if (lines[nameLabelIndex + 1] && looksLikeName(lines[nameLabelIndex + 1])) {
                fullName = lines[nameLabelIndex + 1];
            }
        }
    }
    const fields = {};
    if (fullName)
        fields.fullName = fullName;
    if (dateOfBirth)
        fields.dateOfBirth = dateOfBirth;
    if (yearOfBirth)
        fields.yearOfBirth = yearOfBirth;
    if (gender)
        fields.gender = gender;
    if (aadhaarNumber) {
        fields.idType = 'aadhaar';
        fields.idNumber = aadhaarNumber;
        fields.idNumberMasked = maskAadhaar(aadhaarNumber);
    }
    return {
        fields,
        extractedTextPreview: joined.slice(0, 600)
    };
}
const upload = multer({
    storage: multer.diskStorage({
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
/**
 * In-memory store for run results keyed by traceId.
 */
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
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Agentic Onboarding Orchestrated" });
});
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
                extractedText = await extractTextFromPdf(attachment.filePath);
            }
            else {
                extractedText = await extractTextFromImage(attachment.filePath);
            }
        }
        catch (e) {
            extractedText = '';
        }
        const { fields, extractedTextPreview } = parseAadhaarFieldsFromText(extractedText);
        const hasAnyField = Object.keys(fields).length > 0;
        session.pendingConfirmation = hasAnyField ? fields : null;
        const durationMs = Date.now() - started;
        const reply = hasAnyField
            ? `I extracted Aadhaar details (took ${durationMs}ms). Please confirm below.`
            : `I received ${file.originalname}, but couldn’t reliably extract Aadhaar details. You can enter them manually in chat.`;
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
    console.log('Received request:', req.body); // Keep this for debugging
    const { address } = req.body; // Extract the address object directly
    if (!address || !address.line1) {
        return res.status(400).json({
            error: 'Address is required with at least line1'
        });
    }
    try {
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
                    country: address.country || 'US'
                }
            }
        });
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
 * Returns traceId immediately and, after a short delay, the final result + audit trail.
 */
app.post("/onboarding/start", async (req, res) => {
    const traceId = generateTraceId();
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "KYC",
        payload: req.body.payload || {},
    };
    (0, onboardingWorkflow_1.startOnboarding)(ctx, traceId);
    // Simple wait-loop for demo (not for production)
    setTimeout(() => {
        const result = runResults[traceId] || null;
        const auditTrail = (0, audit_1.getTrace)(traceId);
        res.json({
            traceId,
            status: result ? "completed" : "pending",
            result,
            auditTrail,
        });
    }, 400);
});
/**
 * Fetch audit trail and result for a given traceId (idempotent/async-safe).
 */
app.get("/onboarding/trace/:traceId", (req, res) => {
    const traceId = req.params.traceId;
    const result = runResults[traceId] || null;
    const auditTrail = (0, audit_1.getTrace)(traceId);
    res.json({
        traceId,
        status: result ? "completed" : "pending",
        result,
        auditTrail,
    });
});
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Agentic Onboarding Reference" });
});
app.post("/test/kyc", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "KYC",
        payload: req.body.payload || {},
    };
    const out = await (0, kycAgent_1.runKycAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/aml", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "AML",
        payload: req.body.payload || {},
    };
    const out = await (0, amlAgent_1.runAmlAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/credit", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "CREDIT",
        payload: req.body.payload || {},
    };
    const out = await (0, creditAgent_1.runCreditAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/risk", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "RISK",
        payload: req.body.payload || {},
    };
    const out = await (0, riskAgent_1.runRiskAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.use((err, _req, res, _next) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = typeof err?.message === 'string' ? err.message : 'Internal server error';
    res.status(status).json({
        error: message
    });
});
const port = process.env.PORT || 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${port}`);
});
