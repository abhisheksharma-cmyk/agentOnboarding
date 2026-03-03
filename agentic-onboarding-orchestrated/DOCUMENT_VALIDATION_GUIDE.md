# Document Validation Guide - Step by Step

This guide explains how document validation works for different document types in the agentic onboarding system.

## Supported Document Types

1. **Passport** (`passport`)
2. **Driver's License** (`drivers_license`)
3. **Aadhaar Card** (`aadhar`)
4. **Utility Bill** (`utility_bill`)
5. **Bank Statement** (`bank_statement`)

## Architecture Overview

```
Frontend (ChatInterface)
    ↓
Document Upload → DocumentService
    ↓
Onboarding Start → Orchestrator
    ↓
KYC Agent → Mock KYC2 Agent
    ↓
Groq Extraction + Document Validation
    ↓
Decision Returned to Frontend
```

## Step-by-Step Implementation

### Step 1: Frontend Document Upload

**Location**: `verinite-ai-customer-onboard-app/src/components/ChatInterface/ChatInterface.tsx`

**What happens**:
1. User selects document type from UI
2. User uploads file
3. File is validated client-side:
   - File size check (max 10MB)
   - File type check (PDF, JPG, PNG)
   - Basic format validation

**Key Code**:
```typescript
const validateFile = (file: File, documentType: string) => {
  // Validates file size, type, and basic format
}
```

### Step 2: Document Upload to Backend

**Location**: `verinite-ai-customer-onboard-app/src/services/documentService.ts`

**What happens**:
1. File is uploaded via FormData to `/kyc/documents`
2. Document type is included in the request
3. Backend saves the document and returns documentId

**Key Code**:
```typescript
export const uploadDocument = async (file: File, documentType: string, context: any)
```

### Step 3: Start Onboarding Process

**Location**: `agentic-onboarding-orchestrated/src/index.ts` - `/onboarding/start` endpoint

**What happens**:
1. Receives documentId and documentType
2. Creates AgentContext with documentType in payload
3. Triggers onboarding workflow

**Key Code**:
```typescript
const ctx: AgentContext = {
  payload: {
    documentType: documentType,
    documents: [],
    applicant: {}
  }
};
```

### Step 4: KYC Agent Processing

**Location**: `agentic-onboarding-orchestrated/src/agents/kycAgent.ts`

**What happens**:
1. Gets KYC agent configuration
2. Calls HTTP agent (mock-kyc2-agent) with context
3. Context includes documentType for validation

### Step 5: Document Validation in KYC2 Agent

**Location**: `agentic-onboarding-orchestrated/mocks/mock-kyc2-agent.js`

**What happens**:
1. Receives request with document type
2. Calls Groq for document extraction
3. Applies type-specific validation rules:

#### Passport Validation:
- ✅ Passport number: 8-9 alphanumeric characters
- ✅ Name: Required
- ✅ Date of birth: Required, valid date format
- ✅ Expiry date: Required, must not be expired
- ✅ Document quality check

#### Driver's License Validation:
- ✅ License number: 8-16 alphanumeric characters
- ✅ Name: Required
- ✅ Date of birth: Required
- ✅ Expiry date: Optional but checked if present
- ✅ Address: Optional but validated if present

#### Aadhaar Validation:
- ✅ Aadhaar number: Exactly 12 digits
- ✅ Verhoeff checksum validation
- ✅ Name: Required
- ✅ Date of birth: Required
- ✅ Gender: Optional but validated

#### Utility Bill Validation:
- ✅ Account/Reference number: Required
- ✅ Address: Required, minimum 10 characters
- ✅ Account holder name: Required
- ✅ Bill date: Required, must be within last 3 months
- ✅ Document quality check

#### Bank Statement Validation:
- ✅ Account number: 8-18 digits
- ✅ Account holder name: Required
- ✅ Address: Required, minimum 10 characters
- ✅ Statement date: Required, must be within last 3 months
- ✅ Document quality check

**Key Code**:
```javascript
// Type-specific validation logic in mock-kyc2-agent.js
if (docType.includes('passport')) {
  // Passport validation rules
} else if (docType.includes('driver') || docType.includes('license')) {
  // Driver's license validation rules
}
// ... etc
```

### Step 6: Groq Extraction

**Location**: `agentic-onboarding-orchestrated/groq/groqClient.js`

**What happens**:
1. Sends document data to Groq API
2. Groq extracts structured data (number, name, DOB, etc.)
3. Returns extracted fields in JSON format

### Step 7: Decision Building

**Location**: `agentic-onboarding-orchestrated/mocks/mock-kyc2-agent.js` - `buildDecision()`

**What happens**:
1. Combines Groq extraction with validation results
2. Calculates confidence score
3. Determines proposal (approve/escalate/deny)
4. Adds validation errors to reasons
5. Returns decision with metadata

**Decision Factors**:
- Document completeness
- Validation errors
- Document quality
- Authenticity checks
- Expiry status (for ID documents)
- Recency (for bills/statements)

### Step 8: Response to Frontend

**Location**: `verinite-ai-customer-onboard-app/src/components/ChatInterface/ChatInterface.tsx`

**What happens**:
1. Polls `/onboarding/trace/${traceId}` for status
2. When completed, extracts `finalDecision`
3. Displays user-friendly message:
   - ✅ APPROVE: "Verification approved!"
   - ❌ DENY: "Verification denied"
   - ⚠️ ESCALATE: "Requires manual review"

## Validation Rules Summary

### Common Rules (All Documents):
- File size: Max 10MB
- File types: PDF, JPG, PNG
- Document quality: Must be readable
- Authenticity: Must look authentic

### Type-Specific Rules:

| Document Type | Required Fields | Special Rules |
|--------------|----------------|---------------|
| Passport | Number, Name, DOB, Expiry | Must not be expired |
| Driver's License | Number, Name, DOB | Expiry checked if present |
| Aadhaar | Number (12 digits), Name, DOB | Verhoeff checksum validation |
| Utility Bill | Account#, Address, Name, Date | Must be within 3 months |
| Bank Statement | Account#, Address, Name, Date | Must be within 3 months |

## Testing Document Validation

### Test Passport:
```bash
curl -X POST http://localhost:5005/agents/kyc2/decide \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "context": {
        "payload": {
          "documentType": "passport",
          "documents": [{
            "type": "passport",
            "number": "AB1234567",
            "name": "John Doe",
            "dob": "1990-01-01",
            "expiryDate": "2030-01-01",
            "quality": "high",
            "looks_authentic": true
          }]
        }
      }
    }
  }'
```

### Test Aadhaar:
```bash
curl -X POST http://localhost:5005/agents/kyc2/decide \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "context": {
        "payload": {
          "documentType": "aadhar",
          "documents": [{
            "type": "aadhar",
            "number": "123456789012",
            "name": "John Doe",
            "dob": "1990-01-01",
            "quality": "high"
          }]
        }
      }
    }
  }'
```

## Error Handling

### Frontend Errors:
- File size too large
- Invalid file type
- Missing document type selection

### Backend Errors:
- Invalid document type
- Missing required fields
- Expired documents
- Documents older than 3 months (bills/statements)
- Invalid format (e.g., wrong passport number format)
- Checksum validation failure (Aadhaar)

## Next Steps for Enhancement

1. **OCR Integration**: Add OCR for extracting text from images
2. **Image Quality Check**: Implement blur detection
3. **Tampering Detection**: Add image manipulation detection
4. **Database Storage**: Store validation results for audit
5. **Real-time Feedback**: Show validation progress in UI
6. **Multi-document Support**: Allow multiple documents per type
7. **Document Comparison**: Compare data across documents

## Files Modified/Created

1. ✅ `src/services/documentValidator.ts` - Validation service (TypeScript)
2. ✅ `mocks/mock-kyc2-agent.js` - Enhanced with validation logic
3. ✅ `src/index.ts` - Updated to pass documentType
4. ✅ `src/components/ChatInterface/ChatInterface.tsx` - Added validation and feedback
5. ✅ `src/services/documentService.ts` - Updated to pass documentType

## Usage Example

```typescript
// In ChatInterface component
const handleDocumentUpload = async (file: File, documentType: string) => {
  // 1. Validate file
  const validation = validateFile(file, documentType);
  if (!validation.isValid) {
    // Show errors
    return;
  }

  // 2. Upload document
  const uploadResponse = await uploadDocument(file, documentType, context);

  // 3. Start onboarding
  const onboardingResponse = await startOnboarding(
    uploadResponse.documentId, 
    documentType, 
    context
  );

  // 4. Poll for results
  // ... polling logic
};
```

## Troubleshooting

### Issue: Document type not recognized
**Solution**: Ensure documentType is passed in the payload and matches one of the supported types.

### Issue: Validation always fails
**Solution**: Check that required fields are present in the document data extracted by Groq.

### Issue: Expired document error
**Solution**: For ID documents, ensure expiryDate is in the future. For bills, ensure issueDate is within 3 months.

### Issue: Aadhaar checksum fails
**Solution**: Verify the Aadhaar number is exactly 12 digits and passes Verhoeff algorithm.

