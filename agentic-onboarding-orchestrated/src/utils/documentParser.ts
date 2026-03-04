
import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import * as poppler from 'pdf-poppler';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const TEMP_OCR_DIR = path.join(process.cwd(), 'tmp', 'ocr');

// Ensure OCR temp directory exists
if (!fs.existsSync(TEMP_OCR_DIR)) {
    fs.mkdirSync(TEMP_OCR_DIR, { recursive: true });
}

export async function extractTextFromPdf(filePath: string): Promise<string> {
    try {
        console.log(`[DocumentParser] Attempting to extract text from PDF: ${filePath}`);
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        let extractedText = data.text.trim();

        if (!extractedText || extractedText.length < 10) { // If no text or very little text extracted, try OCR
            console.log(`[DocumentParser] PDF text extraction yielded little or no text. Attempting OCR for ${filePath}`);
            const pdfOcrText = await ocrPdf(filePath);
            if (pdfOcrText) {
                extractedText = pdfOcrText;
            }
        }

        console.log("[DocumentParser] Extracted text from PDF (or OCR fallback):", extractedText.slice(0, 500) + (extractedText.length > 500 ? '...' : ''));
        return extractedText;
    } catch (error) {
        console.error(`[DocumentParser] Error extracting text from PDF (${filePath}):`, error);
        return '';
    }
}

export async function extractTextFromImage(filePath: string): Promise<string> {
    try {
        console.log(`[DocumentParser] Attempting to extract text from Image: ${filePath}`);
        const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
        console.log("[DocumentParser] Extracted text from Image:", text.slice(0, 500) + (text.length > 500 ? '...' : ''));
        return text;
    } catch (error) {
        console.error(`[DocumentParser] Error extracting text from Image (${filePath}):`, error);
        return '';
    }
}

async function ocrPdf(pdfFilePath: string): Promise<string> {
    const outputDir = path.join(TEMP_OCR_DIR, uuidv4());
    fs.mkdirSync(outputDir, { recursive: true });
    let fullText = '';

    try {
        console.log(`[DocumentParser] Converting PDF to images for OCR: ${pdfFilePath}`);
        const options = {
            format: 'png',
            out_dir: outputDir,
            out_prefix: path.basename(pdfFilePath, path.extname(pdfFilePath)),
            // scale: 2048 // Adjust scale for better OCR results if needed
        };

        const pages = await poppler.convert(pdfFilePath, options);
        console.log(`[DocumentParser] poppler.convert returned:`, pages); // Log the raw output
        if (!Array.isArray(pages) || pages.length === 0) {
            console.warn(`[DocumentParser] poppler.convert did not return an array of pages or returned an empty array.`);
            return ''; // Return empty string if no pages were converted
        }
        console.log(`[DocumentParser] Converted ${pages.length} pages to images. Paths: ${pages.join(', ')}`);

        for (const pagePath of pages) {
            console.log(`[DocumentParser] Performing OCR on image: ${pagePath}`);
            const { data: { text } } = await Tesseract.recognize(pagePath, 'eng');
            console.log(`[DocumentParser] OCR result for ${pagePath}: ${text.slice(0, 200)}...`); // Log first 200 chars
            fullText += text + '\n';
            fs.unlinkSync(pagePath); // Clean up image file
        }
    } catch (error) {
        console.error(`[DocumentParser] Error during PDF OCR process for ${pdfFilePath}:`, error);
    } finally {
        // Clean up the temporary directory
        if (fs.existsSync(outputDir)) {
            fs.rmdirSync(outputDir, { recursive: true });
        }
    }
    return fullText.trim();
}


export function parseDocumentFields(rawText: string, documentType?: string) {
    const text = (rawText || '').replace(/\r/g, '');
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const joined = lines.join('\n');
    const fields: any = {
        fullName: null,
        dateOfBirth: null,
        idNumber: null,
        idType: documentType || 'unknown',
        gender: null
    };

    // Generic ID Number heuristic
    const panMatch = joined.match(/[A-Z]{5}[0-9]{4}[A-Z]/i);
    const aadhaarMatch = joined.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
    const passportMatch = joined.match(/\b[A-Z][0-9]{7}\b/i); // Common passport format

    if (aadhaarMatch) {
        fields.idNumber = aadhaarMatch[0].replace(/\s+/g, '');
        fields.idType = 'aadhaar';
    } else if (panMatch) {
        fields.idNumber = panMatch[0].toUpperCase();
        fields.idType = 'pan';
    } else if (passportMatch) {
        fields.idNumber = passportMatch[0].toUpperCase();
        fields.idType = 'passport';
    }

    // Generic Date heuristic (DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY)
    const dates = joined.match(/\b(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})\b/g);
    if (dates && dates.length > 0) {
        fields.dateOfBirth = dates[0];
        if (dates.length > 1) fields.expiryDate = dates[1]; // Assume second date might be expiry
    }

    // Look specifically for Expiry label if multiple dates or to confirm
    const expiryLineIndex = lines.findIndex(l => /\b(EXPIRY|EXPIRES|VAL|VALID)\b/i.test(l));
    if (expiryLineIndex !== -1) {
        const line = lines[expiryLineIndex];
        const dateInLine = line.match(/\b(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})\b/);
        if (dateInLine) fields.expiryDate = dateInLine[1];
    }

    // Gender heuristic
    const genderMatch = joined.match(/\b(MALE|FEMALE|TRANSGENDER|M |F )\b/i);
    if (genderMatch) {
        const g = genderMatch[1].toUpperCase().trim();
        fields.gender = g === 'M' ? 'MALE' : g === 'F' ? 'FEMALE' : g;
    }

    // Improved Name heuristic
    const blacklist = new Set([
        'GOVERNMENT', 'INDIA', 'UIDAI', 'AADHAAR', 'PASSPORT', 'REPUBLIC', 'DRIVING', 'LICENSE',
        'DOB', 'DATE', 'BIRTH', 'GENDER', 'MALE', 'FEMALE', 'FATHER', 'HUSBAND', 'NAME'
    ]);

    const looksLikeName = (s: string) => {
        const tokens = s.toUpperCase().split(/\s+/);
        if (tokens.some(t => blacklist.has(t))) return false;
        if (/\d/.test(s)) return false;
        if (s.length < 3) return false;
        if (!/^[A-Za-z .']+$/.test(s)) return false;
        return true;
    };

    const dobLineIndex = lines.findIndex(l => /\b(DOB|BIRTH|YEAR)\b/i.test(l) || /\b\d{2}[/-]\d{2}[/-]\d{4}\b/.test(l));
    if (dobLineIndex > 0) {
        for (let i = dobLineIndex - 1; i >= 0; i -= 1) {
            if (looksLikeName(lines[i])) {
                fields.fullName = lines[i];
                break;
            }
        }
    }

    if (!fields.fullName) {
        // Look for common labels
        const nameLabelIndex = lines.findIndex(l => /\bNAME\b\s*:/i.test(l));
        if (nameLabelIndex !== -1) {
            const line = lines[nameLabelIndex].split(':').slice(1).join(':').trim();
            if (line && looksLikeName(line)) fields.fullName = line;
        }
    }

    console.log("[DocumentParser] Raw text for parsing:", rawText.slice(0, 500) + (rawText.length > 500 ? '...' : ''));
    console.log("[DocumentParser] Parsed fields:", fields);
    return fields;
}
