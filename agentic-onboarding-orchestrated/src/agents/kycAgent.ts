import { AgentContext } from "../types/types";
import { Agent, UserInput, AgentResponse } from '../types/agent.types';
import { DocumentService } from '../services/documentService';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { runConfiguredAgent } from "../composable/runConfiguredAgent";
import { AgentOutput, SlotName } from "../types/types";
import {
  extractTextFromPdf,
  extractTextFromImage
} from "../utils/documentParser";
import path from 'path';
import fs from 'fs';


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
  const payload = ctx.payload || {};
  let documents = payload.documents || [];

  if (documents.length === 0 && payload.documentId) {
    const filePath = DocumentService.getDocumentPath(payload.documentId);
    if (filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      let text = "";
      if (ext === '.pdf') {
        text = await extractTextFromPdf(filePath);
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        text = await extractTextFromImage(filePath);
      }

      documents = [{
        type: payload.documentType || 'unknown',
        id: payload.documentId,
        text: text,
        fileName: path.basename(filePath)
      }];
    }
  }

  // Ensure documentType is always present for downstream prompt/templates.
  const kycContext: AgentContext = {
    ...ctx,
    payload: {
      ...payload,
      documents,
      documentType: payload.documentType || (documents[0]?.type) || "unknown",
    },
  };

  return runConfiguredAgent("KYC", kycContext, async (currentCtx) => {
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
