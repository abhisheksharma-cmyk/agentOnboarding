import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AgentContext } from '../types/types';

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_DOC_TYPES = ['passport', 'drivers_license','aadhar', 'utility_bill', 'bank_statement'];

export class DocumentService {
  static async saveDocument(
    file: Express.Multer.File,
    documentType: string,
    context: AgentContext
  ): Promise<{ documentId: string; filePath: string }> {
    // Ensure documents directory exists
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    }

    // Validate document type
    if (!ALLOWED_DOC_TYPES.includes(documentType)) {
      throw new Error(`Invalid document type. Allowed types: ${ALLOWED_DOC_TYPES.join(', ')}`);
    }

    // Validate file type
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(fileExt)) {
      throw new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`);
    }

    // Generate unique filename
    const documentId = `doc_${uuidv4()}`;
    const filename = `${documentId}${fileExt}`;
    const filePath = path.join(DOCUMENTS_DIR, filename);

    // Move the file to the documents directory
    await fs.promises.rename(file.path, filePath);

    // Log the document upload
    console.log(`Document uploaded: ${documentId} for ${context.customerId}`);

    return { documentId, filePath };
  }

  static getDocumentPath(documentId: string): string | null {
    const files = fs.readdirSync(DOCUMENTS_DIR);
    const file = files.find(f => f.startsWith(documentId));
    return file ? path.join(DOCUMENTS_DIR, file) : null;
  }

  static validateDocument(file: Express.Multer.File): void {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    // Check file type
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      throw new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`);
    }
  }
}