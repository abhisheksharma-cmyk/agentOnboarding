"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycAgent = void 0;
exports.runKycAgent = runKycAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
const documentService_1 = require("../services/documentService");
const multer_1 = __importDefault(require("multer"));
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});
class KYC {
    constructor() {
        this.name = 'KYC Agent';
        this.description = 'Handles KYC document verification';
    }
    async handle(input, context) {
        try {
            // Implement the KYC handling logic here
            return {
                success: true,
                message: 'KYC processing completed',
                data: {}
            };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'KYC processing failed'
            };
        }
    }
    setNextAgent(agent) {
        this.nextAgent = agent;
    }
}
exports.kycAgent = new KYC();
// Add endpoints to the prototype since they're static
Object.defineProperty(exports.kycAgent, 'endpoints', {
    value: [
        {
            method: 'post',
            path: '/kyc/documents',
            handler: [
                upload.single('document'),
                async (req, res) => {
                    try {
                        if (!req.file) {
                            return res.status(400).json({
                                success: false,
                                message: 'No file uploaded'
                            });
                        }
                        const { documentType } = req.body;
                        const context = {
                            customerId: req.body.customerId || '',
                            applicationId: req.body.applicationId || '',
                            slot: 'KYC',
                            payload: { document: req.file, documentType: req.body.documentType }
                        };
                        // Save the document
                        const { documentId, filePath } = await documentService_1.DocumentService.saveDocument(req.file, documentType, context);
                        // Start the KYC verification process
                        // This is where you would integrate with your KYC provider
                        // For now, we'll just return a success response
                        const verificationResult = {
                            documentId,
                            status: 'pending_verification',
                            timestamp: new Date().toISOString()
                        };
                        res.json({
                            success: true,
                            data: verificationResult
                        });
                    }
                    catch (error) {
                        console.error('KYC document upload error:', error);
                        res.status(400).json({
                            success: false,
                            message: error instanceof Error ? error.message : 'An unknown error occurred'
                        });
                    }
                }
            ]
        },
        {
            method: 'get',
            path: '/kyc/documents/:documentId',
            handler: async (req, res) => {
                try {
                    const { documentId } = req.params;
                    const filePath = documentService_1.DocumentService.getDocumentPath(documentId);
                    if (!filePath) {
                        return res.status(404).json({
                            success: false,
                            message: 'Document not found'
                        });
                    }
                    res.download(filePath);
                }
                catch (error) {
                    console.error('Error retrieving document:', error);
                    res.status(500).json({
                        success: false,
                        message: 'Failed to retrieve document'
                    });
                }
            }
        }
    ]
});
/**
 * KYC agent wrapper.
 * In production, this might call an external KYC LLM agent or vendor adapter.
 */
async function runKycAgent(ctx) {
    const agentInfo = (0, agentRegistry_1.getAgentConfig)("KYC");
    if (!agentInfo) {
        throw new Error('No KYC agent configuration found');
    }
    const { agentId, config } = agentInfo;
    if (config.type === "http") {
        const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
        out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "KYC" };
        return out;
    }
    // Fallback local behavior
    return {
        success: false,
        message: "KYC local fallback - no HTTP agent configured",
        proposal: "escalate",
        confidence: 0.5,
        reasons: ["KYC local fallback - no HTTP agent configured"],
        policy_refs: [],
        flags: { missing_data: true },
        metadata: { agent_name: "kyc_local_fallback", slot: "KYC" }
    };
}
