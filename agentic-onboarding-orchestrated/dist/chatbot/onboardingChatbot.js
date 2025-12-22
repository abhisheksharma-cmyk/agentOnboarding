"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingChatbot = exports.OnboardingChatbot = void 0;
const axios_1 = __importDefault(require("axios"));
const eventBus_1 = require("../eventBus/eventBus");
const kycAgent_1 = require("../agents/kycAgent");
class OnboardingChatbot {
    constructor() {
        this.userSessions = new Map();
        this.sessionStates = new Map();
        // States for the conversation flow
        this.STATES = {
            START: 'start',
            GET_NAME: 'get_name',
            GET_DOB: 'get_dob',
            GET_EMAIL: 'get_email',
            GET_PHONE: 'get_phone',
            GET_ADDRESS: 'get_address',
            GET_AADHAAR: 'get_aadhaar',
            GET_PAN: 'get_pan',
            GET_PASSPORT: 'get_passport',
            UPLOAD_DOCUMENTS: 'upload_documents',
            VERIFICATION: 'verification',
            COMPLETE: 'complete'
        };
    }
    async handleMessage(sessionId, message, files = []) {
        // Initialize or get user session
        if (!this.userSessions.has(sessionId)) {
            this.userSessions.set(sessionId, { id: sessionId });
            this.sessionStates.set(sessionId, this.STATES.START);
        }
        const userData = this.userSessions.get(sessionId);
        const currentState = this.sessionStates.get(sessionId);
        // Handle file uploads if any
        if (files.length > 0) {
            await this.handleFileUploads(sessionId, files);
        }
        // State machine for conversation flow
        switch (currentState) {
            case this.STATES.START:
                this.sessionStates.set(sessionId, this.STATES.GET_NAME);
                return "Welcome to the onboarding process! Let's start with your full name.";
            case this.STATES.GET_NAME:
                userData.name = message.trim();
                this.sessionStates.set(sessionId, this.STATES.GET_DOB);
                return "Great! What's your date of birth? (DD/MM/YYYY)";
            case this.STATES.GET_DOB:
                if (!this.isValidDate(message)) {
                    return "Please enter a valid date in DD/MM/YYYY format.";
                }
                userData.dateOfBirth = message;
                this.sessionStates.set(sessionId, this.STATES.GET_EMAIL);
                return "What's your email address?";
            case this.STATES.GET_EMAIL:
                if (!this.isValidEmail(message)) {
                    return "Please enter a valid email address.";
                }
                userData.email = message;
                this.sessionStates.set(sessionId, this.STATES.GET_PHONE);
                return "What's your phone number? (with country code)";
            case this.STATES.GET_PHONE:
                userData.phone = message;
                this.sessionStates.set(sessionId, this.STATES.GET_ADDRESS);
                return "Please provide your address (line 1):";
            case this.STATES.GET_ADDRESS:
                if (!userData.address)
                    userData.address = {};
                if (!userData.address.line1) {
                    userData.address.line1 = message;
                    return "Address line 2 (if any, or type 'skip'):";
                }
                else if (!userData.address.city && message.toLowerCase() !== 'skip') {
                    userData.address.line2 = message;
                    return "City:";
                }
                else if (!userData.address.city) {
                    userData.address.line2 = '';
                    return "City:";
                }
                else if (!userData.address.state) {
                    userData.address.city = message;
                    return "State:";
                }
                else if (!userData.address.postalCode) {
                    userData.address.state = message;
                    return "Postal Code:";
                }
                else if (!userData.address.country) {
                    userData.address.postalCode = message;
                    return "Country:";
                }
                else {
                    userData.address.country = message;
                    this.sessionStates.set(sessionId, this.STATES.GET_AADHAAR);
                    return "Thank you! Now, please provide your Aadhaar number:";
                }
            case this.STATES.GET_AADHAAR:
                if (!userData.documents)
                    userData.documents = {};
                userData.documents.aadhaar = userData.documents.aadhaar || {};
                userData.documents.aadhaar.number = message;
                this.sessionStates.set(sessionId, this.STATES.GET_PAN);
                return "Please provide your PAN number:";
            case this.STATES.GET_PAN:
                if (!userData.documents)
                    userData.documents = {};
                userData.documents.pan = userData.documents.pan || {};
                userData.documents.pan.number = message;
                this.sessionStates.set(sessionId, this.STATES.GET_PASSPORT);
                return "Do you have a passport? If yes, please provide the number (or type 'skip'):";
            case this.STATES.GET_PASSPORT:
                if (message.toLowerCase() !== 'skip') {
                    if (!userData.documents)
                        userData.documents = {};
                    userData.documents.passport = userData.documents.passport || {};
                    userData.documents.passport.number = message;
                }
                this.sessionStates.set(sessionId, this.STATES.UPLOAD_DOCUMENTS);
                return "Please upload the following documents:\n" +
                    "1. Aadhaar Card (front and back)\n" +
                    "2. PAN Card\n" +
                    "3. Passport (if available)\n" +
                    "4. Address Proof (Utility bill, etc.)\n\n" +
                    "You can upload them one by one. Please upload your Aadhaar card front side first.";
            case this.STATES.UPLOAD_DOCUMENTS:
                // Document upload handling is done in handleFileUploads
                // Just acknowledge the upload and ask for next document if needed
                return "Document received! Please upload the next document or type 'done' if you've uploaded all documents.";
            case this.STATES.VERIFICATION:
                // This state is set after all documents are uploaded
                return "Verification in progress. Please wait...";
            case this.STATES.COMPLETE:
                return "Your onboarding is complete! Thank you for your submission.";
            default:
                return "I'm not sure how to handle that. Could you please rephrase?";
        }
    }
    async handleFileUploads(sessionId, files) {
        const userData = this.userSessions.get(sessionId);
        if (!userData)
            return;
        if (!userData.documents)
            userData.documents = {};
        for (const file of files) {
            const fileType = this.detectFileType(file.originalname);
            // Store the file in the appropriate document field
            if (fileType === 'aadhaar') {
                if (!userData.documents.aadhaar) {
                    userData.documents.aadhaar = {};
                }
                userData.documents.aadhaar.file = file;
            }
            else if (fileType === 'pan') {
                if (!userData.documents.pan) {
                    userData.documents.pan = {};
                }
                userData.documents.pan.file = file;
            }
            else if (fileType === 'passport') {
                if (!userData.documents.passport) {
                    userData.documents.passport = {};
                }
                userData.documents.passport.file = file;
            }
            else if (fileType === 'address') {
                userData.documents.addressProof = file;
            }
        }
        // Check if all required documents are uploaded
        if (this.areAllDocumentsUploaded(userData)) {
            this.sessionStates.set(sessionId, this.STATES.VERIFICATION);
            await this.startVerification(sessionId);
        }
    }
    detectFileType(filename) {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('aadhaar') || lowerName.includes('aadhar'))
            return 'aadhaar';
        if (lowerName.includes('pan'))
            return 'pan';
        if (lowerName.includes('passport'))
            return 'passport';
        if (lowerName.includes('address') ||
            lowerName.includes('utility') ||
            lowerName.includes('bill'))
            return 'address';
        return 'other';
    }
    areAllDocumentsUploaded(userData) {
        // Check if all required documents are present
        return !!(userData.documents?.aadhaar?.file &&
            userData.documents?.pan?.file &&
            userData.documents?.addressProof);
    }
    async startVerification(sessionId) {
        const userData = this.userSessions.get(sessionId);
        if (!userData)
            return;
        try {
            // 1. Verify address
            if (userData.address) {
                const addressVerification = await this.verifyAddress(userData);
                if (!userData.verificationStatus)
                    userData.verificationStatus = {};
                userData.verificationStatus.address = addressVerification.is_valid;
            }
            // 2. Run KYC verification
            const kycResult = await this.runKycVerification(userData);
            if (!userData.verificationStatus)
                userData.verificationStatus = {};
            userData.verificationStatus.kyc = kycResult.proposal === 'approve';
            // 3. Update session state
            this.sessionStates.set(sessionId, this.STATES.COMPLETE);
            // Notify that verification is complete
            eventBus_1.eventBus.publish('onboarding.verification_complete', {
                userId: sessionId,
                status: this.isVerificationComplete(userData) ? 'success' : 'failed',
                userData
            }, sessionId);
        }
        catch (error) {
            console.error('Verification failed:', error);
            eventBus_1.eventBus.publish('onboarding.verification_failed', {
                userId: sessionId,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }, sessionId);
        }
    }
    async verifyAddress(userData) {
        const address = userData.address;
        if (!address)
            throw new Error('No address provided');
        const addressString = [
            address.line1,
            address.line2,
            address.city,
            address.state,
            address.postalCode,
            address.country
        ].filter(Boolean).join(', ');
        try {
            let documentBase64 = null;
            if (userData.documents?.addressProof) {
                documentBase64 = await this.fileToBase64(userData.documents.addressProof);
            }
            const response = await axios_1.default.post('http://localhost:3000/api/v1/verify', {
                address: addressString,
                document: documentBase64
            });
            return response.data;
        }
        catch (error) {
            console.error('Address verification failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Address verification failed: ${errorMessage}`);
        }
    }
    async runKycVerification(userData) {
        const kycContext = {
            customerId: userData.id,
            applicationId: `app-${Date.now()}`,
            slot: 'KYC',
            payload: {
                name: userData.name,
                dateOfBirth: userData.dateOfBirth,
                documents: {
                    aadhaar: userData.documents?.aadhaar?.number,
                    pan: userData.documents?.pan?.number,
                    passport: userData.documents?.passport?.number
                },
                files: {
                    aadhaar: userData.documents?.aadhaar?.file
                        ? await this.fileToBase64(userData.documents.aadhaar.file)
                        : null,
                    pan: userData.documents?.pan?.file
                        ? await this.fileToBase64(userData.documents.pan.file)
                        : null,
                    passport: userData.documents?.passport?.file
                        ? await this.fileToBase64(userData.documents.passport.file)
                        : null,
                    addressProof: userData.documents?.addressProof
                        ? await this.fileToBase64(userData.documents.addressProof)
                        : null
                }
            }
        };
        return await (0, kycAgent_1.runKycAgent)(kycContext);
    }
    isVerificationComplete(userData) {
        const status = userData.verificationStatus || {};
        return !!(status.address && status.kyc);
    }
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    isValidDate(dateString) {
        const re = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!re.test(dateString))
            return false;
        const parts = dateString.split('/');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Months are 0-based
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        return date.getFullYear() === year &&
            date.getMonth() === month &&
            date.getDate() === day;
    }
    async fileToBase64(file) {
        // Convert buffer to base64
        return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }
    // Public method to get current session state
    getSessionState(sessionId) {
        return this.sessionStates.get(sessionId);
    }
    // Public method to get user data (for debugging or admin purposes)
    getUserData(sessionId) {
        return this.userSessions.get(sessionId);
    }
}
exports.OnboardingChatbot = OnboardingChatbot;
// Singleton instance
exports.onboardingChatbot = new OnboardingChatbot();
