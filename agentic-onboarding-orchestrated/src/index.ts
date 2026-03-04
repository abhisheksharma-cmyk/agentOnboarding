
import "./bootstrap/loadEnv";
import express from "express";
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import multer from 'multer';
import { initOrchestrator } from "./orchestrator/orchestrator";
import { startOnboarding } from "./workflows/onboardingWorkflow";
import { AgentContext } from "./types/types";
import { eventBus } from "./eventBus/eventBus";
import { getTrace } from "./auditTracking/audit";
import { AgentOutput, SlotName } from "./types/types";
import {
  extractTextFromPdf,
  extractTextFromImage,
  parseDocumentFields
} from "./utils/documentParser";
import { runAddressAgent } from "./agents/addressAgent";
import { kycAgent, runKycAgent } from "./agents/kycAgent";
import { registerAgentEndpoints } from './registry/agentRegistry';
import { loadAgentsConfig, getActiveAgents } from './registry/agentRegistry';
import { runAmlAgent } from "./agents/amlAgent";
import { runCreditAgent } from "./agents/creditAgent";
import { runRiskAgent } from "./agents/riskAgent";
import { evaluateDecision } from "./decisionGateway/decisionGateway";

const app = express();
// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Register agent endpoints
if (kycAgent && 'endpoints' in kycAgent && Array.isArray(kycAgent.endpoints)) {
  kycAgent.endpoints.forEach((endpoint: { method: string; path: string; handler: any }) => {
    const method = endpoint.method.toLowerCase();
    if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
      const handlers = Array.isArray(endpoint.handler)
        ? endpoint.handler
        : [endpoint.handler];

      (app as any)[method](endpoint.path, ...handlers);
    }
  });
}

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  text: string;
  ts: number;
};

type ChatAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  uploadedAt: number;
};

type ChatSession = {
  id: string;
  createdAt: number;
  messages: ChatMessage[];
  slots: Record<string, unknown>;
  attachments: ChatAttachment[];
  pendingConfirmation: Record<string, unknown> | null;
};

const chatSessions = new Map<string, ChatSession>();

function requireSession(sessionId: string): ChatSession {
  const session = chatSessions.get(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    (err as any).status = 404;
    throw err;
  }
  return session;
}

const uploadsRoot = path.join(process.cwd(), 'tmp', 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

// Utility functions
function maskAadhaar(aadhaar: string) {
  const digits = aadhaar.replace(/\D/g, '');
  if (digits.length !== 12) return aadhaar;
  return `XXXX-XXXX-${digits.slice(8)}`;
}


const upload = multer({
  storage: multer.diskStorage({
    destination: (req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
      const sessionId = (req.params as any)?.id;
      const dir = sessionId ? path.join(uploadsRoot, sessionId) : uploadsRoot;
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname) || '';
      cb(null, `${id}${ext}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Unsupported file type. Only PDF, PNG, JPG are allowed.'));
    }
    cb(null, true);
  }
});

/** In-memory store for run results keyed by traceId. */
const runResults: Record<string, any> = {};

function generateTraceId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 10)
  );
}

initOrchestrator();

eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
  runResults[traceId] = data;
});

type WaitResult = { status: "completed" | "pending"; result: any };

function sendError(res: express.Response, err: unknown) {
  // eslint-disable-next-line no-console
  console.error("onboarding/start failed", err);
  return res.status(500).json({
    status: "error",
    message: (err as Error)?.message || "Unexpected error",
  });
}

function buildContext(req: express.Request, slot: SlotName): AgentContext {
  const body = req.body ?? {};
  const payload = (() => {
    if (typeof body.payload === "string") {
      try {
        return JSON.parse(body.payload);
      } catch {
        return {};
      }
    }
    return body.payload ?? {};
  })();

  const documentType = body.documentType || payload.documentType || null;
  const normalizedAddress =
    payload.address ||
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
  let extractedFieldsFromSession: Record<string, unknown> | null = null;
  let documentFromSession: Record<string, unknown> | null = null;
  if (sessionIdFromBody && typeof sessionIdFromBody === 'string') {
    const sess = chatSessions.get(sessionIdFromBody);
    if (sess) {
      console.log("[BuildContext] Session found for sessionId:", sessionIdFromBody);
      console.log("[BuildContext] Session slots content:", sess.slots);
      if (sess.slots && Object.keys(sess.slots).length > 0) {
        extractedFieldsFromSession = { ...sess.slots };
        const docAddress =
          (sess.slots as any).address ||
          normalizedAddress ||
          payload.address ||
          body.address ||
          null;
        documentFromSession = {
          fullName: (sess.slots as any).fullName,
          gender: (sess.slots as any).gender,
          dateOfBirth: (sess.slots as any).dateOfBirth,
          address: docAddress
        };
        console.log("[BuildContext] documentFromSession constructed:", documentFromSession);
      } else {
        console.log("[BuildContext] Session slots are empty or null.");
      }
    } else {
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

async function waitForResult(traceId: string, timeoutMs: number = 30000): Promise<WaitResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (runResults[traceId]) {
      return { status: "completed", result: runResults[traceId] };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { status: "pending", result: null };
}

app.post('/chat/session/start', (_req: express.Request, res: express.Response) => {
  const id = crypto.randomUUID();
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    text: "What's your full name?",
    ts: Date.now()
  };

  const session: ChatSession = {
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

app.post('/chat/session/:id/message', (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});

app.post('/chat/session/:id/upload', upload.single('file'), async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const session = requireSession(req.params.id);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const attachmentId = path.parse(file.filename).name;
    const attachment: ChatAttachment = {
      id: attachmentId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      filePath: file.path,
      uploadedAt: Date.now()
    };

    session.attachments.push(attachment);

    const started = Date.now();

    // MOCK: Instead of parsing document, use the data from chat session slots
    // This ensures document data matches user input for demo purposes
    let fields: any = {};
    let extractedText = '';

    // Check if we have data from the chat session
    if (session.slots && Object.keys(session.slots).length > 0) {
      console.log('[DocumentUpload] Using chat session data as mock extracted fields:', session.slots);
      fields = {
        fullName: session.slots.fullName || null,
        dateOfBirth: session.slots.dateOfBirth || session.slots.dob || null,
        gender: session.slots.gender || null,
        address: session.slots.address || null,
        idType: 'aadhaar',
        idNumber: 'XXXX-XXXX-1234' // Mock ID number
      };
      extractedText = `Mock extraction: ${JSON.stringify(fields)}`;
    } else {
      // Fallback: Try to parse document (may fail with Groq free tier)
      try {
        if (attachment.mimeType === 'application/pdf') {
          extractedText = await extractTextFromPdf(attachment.filePath);
        } else {
          extractedText = await extractTextFromImage(attachment.filePath);
        }
        fields = parseDocumentFields(extractedText);
      } catch (e) {
        console.warn('[DocumentUpload] Document parsing failed:', e);
        extractedText = '';
        fields = {};
      }
    }

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
  } catch (err) {
    next(err);
  }
});

app.post('/chat/session/:id/confirm', (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    } else {
      session.pendingConfirmation = null;
    }

    const reply = confirmed ? 'Thanks — confirmed. I’ve saved these details.' : 'No problem — please tell me the correct details.';
    session.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
    res.json({ assistantMessage: reply, slots: session.slots });
  } catch (err) {
    next(err);
  }
});

// New endpoint to sync user data from chat to session slots
app.post('/chat/session/:id/sync-slots', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const session = requireSession(req.params.id);
    const slots = req.body?.slots;

    if (slots && typeof slots === 'object') {
      // Merge new slots with existing ones
      session.slots = { ...session.slots, ...slots };
      console.log('[SyncSlots] Updated session slots:', session.slots);
      res.json({ success: true, slots: session.slots });
    } else {
      res.status(400).json({ error: 'slots object is required' });
    }
  } catch (err) {
    next(err);
  }
});

app.post('/onboarding/verify-address', async (req: express.Request, res: express.Response) => {
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
    const result = await runAddressAgent({
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
  } catch (error) {
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
app.post("/onboarding/start", async (req: express.Request, res: express.Response) => {
  try {
    const traceId = generateTraceId();
    const ctx = buildContext(req, "KYC");

    startOnboarding(ctx, traceId);

    const { status, result } = await waitForResult(traceId);
    const auditTrail = getTrace(traceId);
    return res.json({ traceId, status, result, auditTrail });
  } catch (err) {
    return sendError(res, err);
  }
});

/** Fetch audit trail and result for a given traceId (idempotent/async-safe). */
app.get("/onboarding/trace/:traceId", (req: express.Request, res: express.Response) => {
  const traceId = req.params.traceId;
  const result = runResults[traceId] || null;
  const auditTrail = getTrace(traceId);

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

app.get("/config/agents", (_req: express.Request, res: express.Response) => {
  try {
    const agents = loadAgentsConfig();
    const active = getActiveAgents();
    const profilePath =
      process.env.AGENTS_CONFIG_PATH || path.join(process.cwd(), "config", "agents.yaml");
    res.json({ profilePath, agents, active });
  } catch (err) {
    res.status(500).json({
      error: "Failed to load agents configuration",
      message: (err as Error)?.message || "Unexpected error"
    });
  }
});

app.post("/test/kyc", async (req: express.Request, res: express.Response) => {
  const ctx = buildContext(req, "KYC");
  const out = await runKycAgent(ctx);
  // Ensure the proposal is always defined
  const agentOutput: AgentOutput = {
    ...out,
    proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
    confidence: out.confidence || 0,
    reasons: out.reasons || [],
    policy_refs: out.policy_refs || [],
    flags: out.flags || {}
  };
  const finalDecision = evaluateDecision(agentOutput, ctx);
  res.json({ agentOutput, finalDecision });
});

app.post("/test/aml", async (req: express.Request, res: express.Response) => {
  const ctx = buildContext(req, "AML");
  const out = await runAmlAgent(ctx);
  // Ensure the proposal is always defined
  const agentOutput: AgentOutput = {
    ...out,
    proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
    confidence: out.confidence || 0,
    reasons: out.reasons || [],
    policy_refs: out.policy_refs || [],
    flags: out.flags || {}
  };
  const finalDecision = evaluateDecision(agentOutput, ctx);
  res.json({ agentOutput, finalDecision });
});

app.post("/test/credit", async (req: express.Request, res: express.Response) => {
  const ctx = buildContext(req, "CREDIT");
  const out = await runCreditAgent(ctx);
  // Ensure the proposal is always defined
  const agentOutput: AgentOutput = {
    ...out,
    proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
    confidence: out.confidence || 0,
    reasons: out.reasons || [],
    policy_refs: out.policy_refs || [],
    flags: out.flags || {}
  };
  const finalDecision = evaluateDecision(agentOutput, ctx);
  res.json({ agentOutput, finalDecision });
});

app.post("/test/risk", async (req: express.Request, res: express.Response) => {
  const ctx = buildContext(req, "RISK");
  const out = await runRiskAgent(ctx);
  // Ensure the proposal is always defined
  const agentOutput: AgentOutput = {
    ...out,
    proposal: out.proposal || 'escalate', // Default to 'escalate' if undefined
    confidence: out.confidence || 0,
    reasons: out.reasons || [],
    policy_refs: out.policy_refs || [],
    flags: out.flags || {}
  };
  const finalDecision = evaluateDecision(agentOutput, ctx);
  res.json({ agentOutput, finalDecision });
});
// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
