import { AgentContext } from "../types/types";
import { Agent, UserInput, AgentResponse } from '../types/agent.types';
import { DocumentService } from '../services/documentService';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { runConfiguredAgent } from "../composable/runConfiguredAgent";
import { AgentOutput } from "../types/types";


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

class KYC implements Agent {
  name: string = 'KYC Agent';
  description: string = 'Handles KYC document verification';
  private nextAgent?: Agent;

  async handle(input: UserInput, context: AgentContext): Promise<AgentResponse> {
    try {
      // Implement the KYC handling logic here
      return {
        success: true,
        message: 'KYC processing completed',
        data: {}
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'KYC processing failed'
      };
    }
  }

  setNextAgent(agent: Agent): void {
    this.nextAgent = agent;
  }
}

export const kycAgent = new KYC();

// Add endpoints to the prototype since they're static
Object.defineProperty(kycAgent, 'endpoints', {
  value: [
    {
      method: 'post',
      path: '/kyc/documents',
      handler: [
        upload.single('document'),
        async (req: Request, res: Response) => {
          try {
            if (!req.file) {
              return res.status(400).json({
                success: false,
                message: 'No file uploaded'
              });
            }
            const { documentType } = req.body;
            const context: AgentContext = {
              customerId: req.body.customerId || '',
              applicationId: req.body.applicationId || '',
              slot: 'KYC',
              payload: { document: req.file, documentType: req.body.documentType }
            };
            // Save the document
            const { documentId, filePath } = await DocumentService.saveDocument(
              req.file,
              documentType,
              context
            );
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
          } catch (error) {
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
      handler: async (req: Request, res: Response) => {
        try {
          const { documentId } = req.params;
          const filePath = DocumentService.getDocumentPath(documentId);
          if (!filePath) {
            return res.status(404).json({
              success: false,
              message: 'Document not found'
            });
          }
          res.download(filePath);
        } catch (error) {
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
export async function runKycAgent(ctx: AgentContext): Promise<AgentOutput> {
  // Ensure documentType is always present for downstream prompt/templates.
  const kycContext: AgentContext = {
    ...ctx,
    payload: {
      ...ctx.payload,
      documentType: ctx.payload?.documentType || "unknown",
    },
  };

  return runConfiguredAgent("KYC", kycContext, async () => ({
    proposal: "escalate",
    confidence: 0.5,
    reasons: ["KYC local fallback - manual review required"],
    policy_refs: [],
    flags: { missing_data: true },
    metadata: { agent_name: "kyc_local_fallback", slot: "KYC" },
  }));
}
