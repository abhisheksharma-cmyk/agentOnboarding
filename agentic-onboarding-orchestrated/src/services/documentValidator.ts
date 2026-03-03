/**
 * Document Validation Service
 * Provides type-specific validation for different document types
 */

export type DocumentType = 
  | 'passport' 
  | 'drivers_license' 
  | 'aadhar' 
  | 'utility_bill' 
  | 'bank_statement';

export interface DocumentValidationResult {
  isValid: boolean;
  documentType: DocumentType;
  extractedData: {
    documentNumber?: string;
    name?: string;
    dateOfBirth?: string;
    expiryDate?: string;
    address?: string;
    issueDate?: string;
    [key: string]: any;
  };
  validationErrors: string[];
  confidence: number; // 0-1
  flags: {
    isExpired?: boolean;
    isBlurry?: boolean;
    isTampered?: boolean;
    missingFields?: string[];
  };
}

export interface DocumentData {
  type?: string;
  number?: string;
  name?: string;
  dob?: string;
  expiryDate?: string;
  issueDate?: string;
  address?: string;
  [key: string]: any;
}

/**
 * Validation rules for each document type
 */
class DocumentValidator {
  /**
   * Validate Passport
   */
  validatePassport(data: DocumentData): DocumentValidationResult {
    const errors: string[] = [];
    const extracted: any = {};
    let confidence = 0;

    // Extract and validate passport number (typically 8-9 alphanumeric)
    if (data.number) {
      const passportRegex = /^[A-Z0-9]{8,9}$/i;
      if (passportRegex.test(data.number)) {
        extracted.documentNumber = data.number;
        confidence += 0.3;
      } else {
        errors.push('Invalid passport number format');
      }
    } else {
      errors.push('Passport number is required');
    }

    // Validate name
    if (data.name && data.name.length >= 2) {
      extracted.name = data.name;
      confidence += 0.2;
    } else {
      errors.push('Name is required');
    }

    // Validate date of birth
    if (data.dob) {
      if (this.isValidDate(data.dob)) {
        extracted.dateOfBirth = data.dob;
        confidence += 0.15;
      } else {
        errors.push('Invalid date of birth format');
      }
    } else {
      errors.push('Date of birth is required');
    }

    // Validate expiry date
    if (data.expiryDate) {
      if (this.isValidDate(data.expiryDate)) {
        extracted.expiryDate = data.expiryDate;
        const isExpired = new Date(data.expiryDate) < new Date();
        if (isExpired) {
          errors.push('Passport has expired');
        }
        confidence += 0.15;
      } else {
        errors.push('Invalid expiry date format');
      }
    } else {
      errors.push('Expiry date is required');
    }

    // Check document quality
    if (data.quality === 'high') {
      confidence += 0.1;
    } else if (data.quality === 'low') {
      errors.push('Document quality is too low');
    }

    // Check authenticity
    if (data.looks_authentic === false) {
      errors.push('Document authenticity is questionable');
    } else if (data.looks_authentic === true) {
      confidence += 0.1;
    }

    return {
      isValid: errors.length === 0 && confidence >= 0.6,
      documentType: 'passport',
      extractedData: extracted,
      validationErrors: errors,
      confidence: Math.min(1, confidence),
      flags: {
        isExpired: data.expiryDate ? new Date(data.expiryDate) < new Date() : undefined,
        isBlurry: data.quality === 'low',
        missingFields: this.getMissingFields(data, ['number', 'name', 'dob', 'expiryDate'])
      }
    };
  }

  /**
   * Validate Driver's License
   */
  validateDriversLicense(data: DocumentData): DocumentValidationResult {
    const errors: string[] = [];
    const extracted: any = {};
    let confidence = 0;

    // Driver's license number validation (varies by country, but typically alphanumeric)
    if (data.number) {
      const licenseRegex = /^[A-Z0-9]{8,16}$/i;
      if (licenseRegex.test(data.number)) {
        extracted.documentNumber = data.number;
        confidence += 0.3;
      } else {
        errors.push('Invalid driver\'s license number format');
      }
    } else {
      errors.push('Driver\'s license number is required');
    }

    // Validate name
    if (data.name && data.name.length >= 2) {
      extracted.name = data.name;
      confidence += 0.2;
    } else {
      errors.push('Name is required');
    }

    // Validate date of birth
    if (data.dob) {
      if (this.isValidDate(data.dob)) {
        extracted.dateOfBirth = data.dob;
        confidence += 0.15;
      } else {
        errors.push('Invalid date of birth format');
      }
    } else {
      errors.push('Date of birth is required');
    }

    // Validate expiry date (optional but recommended)
    if (data.expiryDate) {
      if (this.isValidDate(data.expiryDate)) {
        extracted.expiryDate = data.expiryDate;
        const isExpired = new Date(data.expiryDate) < new Date();
        if (isExpired) {
          errors.push('Driver\'s license has expired');
        }
        confidence += 0.15;
      }
    }

    // Validate address (often present on driver's license)
    if (data.address) {
      extracted.address = data.address;
      confidence += 0.1;
    }

    // Check document quality
    if (data.quality === 'high') {
      confidence += 0.1;
    } else if (data.quality === 'low') {
      errors.push('Document quality is too low');
    }

    return {
      isValid: errors.length === 0 && confidence >= 0.6,
      documentType: 'drivers_license',
      extractedData: extracted,
      validationErrors: errors,
      confidence: Math.min(1, confidence),
      flags: {
        isExpired: data.expiryDate ? new Date(data.expiryDate) < new Date() : undefined,
        isBlurry: data.quality === 'low',
        missingFields: this.getMissingFields(data, ['number', 'name', 'dob'])
      }
    };
  }

  /**
   * Validate Aadhaar Card
   */
  validateAadhaar(data: DocumentData): DocumentValidationResult {
    const errors: string[] = [];
    const extracted: any = {};
    let confidence = 0;

    // Aadhaar number validation (12 digits)
    if (data.number) {
      const aadhaarRegex = /^\d{12}$/;
      if (aadhaarRegex.test(data.number)) {
        // Check Verhoeff algorithm (simplified check)
        if (this.verhoeffCheck(data.number)) {
          extracted.documentNumber = data.number;
          confidence += 0.4;
        } else {
          errors.push('Invalid Aadhaar number checksum');
        }
      } else {
        errors.push('Aadhaar number must be exactly 12 digits');
      }
    } else {
      errors.push('Aadhaar number is required');
    }

    // Validate name
    if (data.name && data.name.length >= 2) {
      extracted.name = data.name;
      confidence += 0.2;
    } else {
      errors.push('Name is required');
    }

    // Validate date of birth
    if (data.dob) {
      if (this.isValidDate(data.dob)) {
        extracted.dateOfBirth = data.dob;
        confidence += 0.2;
      } else {
        errors.push('Invalid date of birth format');
      }
    } else {
      errors.push('Date of birth is required');
    }

    // Validate gender (often present on Aadhaar)
    if (data.gender) {
      extracted.gender = data.gender;
      confidence += 0.1;
    }

    // Check document quality
    if (data.quality === 'high') {
      confidence += 0.1;
    } else if (data.quality === 'low') {
      errors.push('Document quality is too low');
    }

    // Check authenticity
    if (data.looks_authentic === false) {
      errors.push('Document authenticity is questionable');
    } else if (data.looks_authentic === true) {
      confidence += 0.1;
    }

    return {
      isValid: errors.length === 0 && confidence >= 0.7,
      documentType: 'aadhar',
      extractedData: extracted,
      validationErrors: errors,
      confidence: Math.min(1, confidence),
      flags: {
        isBlurry: data.quality === 'low',
        missingFields: this.getMissingFields(data, ['number', 'name', 'dob'])
      }
    };
  }

  /**
   * Validate Utility Bill
   */
  validateUtilityBill(data: DocumentData): DocumentValidationResult {
    const errors: string[] = [];
    const extracted: any = {};
    let confidence = 0;

    // Utility bills typically have account number or reference number
    if (data.number) {
      extracted.documentNumber = data.number;
      confidence += 0.2;
    } else {
      errors.push('Account/Reference number is required');
    }

    // Validate address (critical for utility bills)
    if (data.address) {
      if (data.address.length >= 10) {
        extracted.address = data.address;
        confidence += 0.3;
      } else {
        errors.push('Address is too short or incomplete');
      }
    } else {
      errors.push('Address is required');
    }

    // Validate name (account holder name)
    if (data.name) {
      extracted.name = data.name;
      confidence += 0.2;
    } else {
      errors.push('Account holder name is required');
    }

    // Validate issue date (bill date)
    if (data.issueDate) {
      if (this.isValidDate(data.issueDate)) {
        extracted.issueDate = data.issueDate;
        // Check if bill is recent (within last 3 months)
        const billDate = new Date(data.issueDate);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (billDate < threeMonthsAgo) {
          errors.push('Utility bill is older than 3 months');
        }
        confidence += 0.15;
      } else {
        errors.push('Invalid bill date format');
      }
    } else {
      errors.push('Bill date is required');
    }

    // Check document quality
    if (data.quality === 'high') {
      confidence += 0.15;
    } else if (data.quality === 'low') {
      errors.push('Document quality is too low');
    }

    return {
      isValid: errors.length === 0 && confidence >= 0.6,
      documentType: 'utility_bill',
      extractedData: extracted,
      validationErrors: errors,
      confidence: Math.min(1, confidence),
      flags: {
        isBlurry: data.quality === 'low',
        missingFields: this.getMissingFields(data, ['number', 'address', 'name', 'issueDate'])
      }
    };
  }

  /**
   * Validate Bank Statement
   */
  validateBankStatement(data: DocumentData): DocumentValidationResult {
    const errors: string[] = [];
    const extracted: any = {};
    let confidence = 0;

    // Bank account number validation
    if (data.number) {
      // Account numbers vary, but typically 8-18 digits
      const accountRegex = /^[0-9]{8,18}$/;
      if (accountRegex.test(data.number)) {
        extracted.documentNumber = data.number;
        confidence += 0.25;
      } else {
        errors.push('Invalid bank account number format');
      }
    } else {
      errors.push('Account number is required');
    }

    // Validate account holder name
    if (data.name) {
      extracted.name = data.name;
      confidence += 0.2;
    } else {
      errors.push('Account holder name is required');
    }

    // Validate address
    if (data.address) {
      if (data.address.length >= 10) {
        extracted.address = data.address;
        confidence += 0.2;
      } else {
        errors.push('Address is too short or incomplete');
      }
    } else {
      errors.push('Address is required');
    }

    // Validate statement period (issue date or date range)
    if (data.issueDate) {
      if (this.isValidDate(data.issueDate)) {
        extracted.issueDate = data.issueDate;
        // Check if statement is recent (within last 3 months)
        const statementDate = new Date(data.issueDate);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (statementDate < threeMonthsAgo) {
          errors.push('Bank statement is older than 3 months');
        }
        confidence += 0.15;
      } else {
        errors.push('Invalid statement date format');
      }
    } else {
      errors.push('Statement date is required');
    }

    // Check document quality
    if (data.quality === 'high') {
      confidence += 0.2;
    } else if (data.quality === 'low') {
      errors.push('Document quality is too low');
    }

    return {
      isValid: errors.length === 0 && confidence >= 0.6,
      documentType: 'bank_statement',
      extractedData: extracted,
      validationErrors: errors,
      confidence: Math.min(1, confidence),
      flags: {
        isBlurry: data.quality === 'low',
        missingFields: this.getMissingFields(data, ['number', 'name', 'address', 'issueDate'])
      }
    };
  }

  /**
   * Main validation method
   */
  validateDocument(documentType: DocumentType, data: DocumentData): DocumentValidationResult {
    switch (documentType) {
      case 'passport':
        return this.validatePassport(data);
      case 'drivers_license':
        return this.validateDriversLicense(data);
      case 'aadhar':
        return this.validateAadhaar(data);
      case 'utility_bill':
        return this.validateUtilityBill(data);
      case 'bank_statement':
        return this.validateBankStatement(data);
      default:
        return {
          isValid: false,
          documentType: documentType,
          extractedData: {},
          validationErrors: [`Unsupported document type: ${documentType}`],
          confidence: 0,
          flags: {}
        };
    }
  }

  /**
   * Helper: Validate date format
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Helper: Get missing required fields
   */
  private getMissingFields(data: DocumentData, requiredFields: string[]): string[] {
    return requiredFields.filter(field => !data[field]);
  }

  /**
   * Verhoeff algorithm for Aadhaar validation
   */
  private verhoeffCheck(num: string): boolean {
    const verhoeffD = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];

    const verhoeffP = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];

    let c = 0;
    const digits = num.split('').reverse().map(Number);
    for (let i = 0; i < digits.length; i++) {
      c = verhoeffD[c][verhoeffP[i % 8][digits[i]]];
    }
    return c === 0;
  }
}

export const documentValidator = new DocumentValidator();

