"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycAgent = void 0;
exports.runKycAgent = runKycAgent;
const documentService_1 = require("../services/documentService");
const multer_1 = __importDefault(require("multer"));
const runConfiguredAgent_1 = require("../composable/runConfiguredAgent");
const documentParser_1 = require("../utils/documentParser");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
    const payload = ctx.payload || {};
    let documents = payload.documents || [];
    if (documents.length === 0 && payload.documentId) {
        const filePath = documentService_1.DocumentService.getDocumentPath(payload.documentId);
        if (filePath && fs_1.default.existsSync(filePath)) {
            const ext = path_1.default.extname(filePath).toLowerCase();
            let text = "";
            if (ext === '.pdf') {
                text = await (0, documentParser_1.extractTextFromPdf)(filePath);
            }
            else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                text = await (0, documentParser_1.extractTextFromImage)(filePath);
            }
            documents = [{
                    type: payload.documentType || 'unknown',
                    id: payload.documentId,
                    text: text,
                    fileName: path_1.default.basename(filePath)
                }];
        }
    }
    // Ensure documentType is always present for downstream prompt/templates.
    const kycContext = {
        ...ctx,
        payload: {
            ...payload,
            documents,
            documentType: payload.documentType || (documents[0]?.type) || "unknown",
        },
    };
    return (0, runConfiguredAgent_1.runConfiguredAgent)("KYC", kycContext, async (currentCtx) => {
        const applicant = currentCtx.payload?.applicant || {};
        const extracted = currentCtx.payload?.extractedData || {}; // Assume some extracted data exists
        // For demo: if we have manually entered data, we'll simulate a match.
        // In a real scenario, this would compare applicant.fullName with extracted.name, etc.
        const hasMatch = !!(applicant.fullName && applicant.dateOfBirth && applicant.address);
        return {
            proposal: hasMatch ? "approve" : "escalate",
            confidence: hasMatch ? 0.92 : 0.5,
            reasons: [hasMatch ? "KYC data matches applicant profile" : "KYC local fallback - manual review required"],
            policy_refs: hasMatch ? ["KYC-MATCH-01"] : [],
            flags: {
                missing_data: !hasMatch,
                data_match: hasMatch
            },
            metadata: {
                agent_name: "kyc_local_matcher",
                slot: "KYC",
                match_details: {
                    name: !!applicant.fullName,
                    dob: !!applicant.dateOfBirth,
                    address: !!applicant.address
                }
            },
        };
    });
}
