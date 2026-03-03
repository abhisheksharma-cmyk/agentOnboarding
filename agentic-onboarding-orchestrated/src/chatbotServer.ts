import express from 'express';
import multer from 'multer';
import { onboardingChatbot } from './chatbot/onboardingChatbot';
import { eventBus } from './eventBus/eventBus';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

// Define a type for the file mapping to handle both Express.Multer.File and standard File
type ProcessedFile = {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
    fieldname: string;
};
import path from 'path';

const app = express();
const port = process.env.PORT || 5005;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
    fileFilter: (req, file, cb) => {
        // Accept only certain file types
        const filetypes = /jpeg|jpg|png|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image (JPEG, JPG, PNG) and PDF files are allowed'));
        }
    }
});

// Generate a unique session ID for new users
app.post('/api/chat/session', (req, res) => {
    const sessionId = uuidv4();
    res.json({ sessionId });
});

// Handle chat messages and file uploads
app.post('/api/chat/message', upload.array('files', 5), async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        const uploadedFiles = (req.files as Express.Multer.File[]) || [];

        // Map the uploaded files to the expected format
        const files: ProcessedFile[] = uploadedFiles.map(file => ({
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            fieldname: file.fieldname
        }));

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Handle the message and any uploaded files
        const response = await onboardingChatbot.handleMessage(sessionId, message || '', files);

        res.json({
            message: response,
            sessionId,
            state: onboardingChatbot.getSessionState(sessionId)
        });
    } catch (error) {
        console.error('Error handling chat message:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({
            error: 'An error occurred while processing your message',
            details: errorMessage
        });
    }
});

// Get session status
app.get('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const state = onboardingChatbot.getSessionState(sessionId);

    if (!state) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
        sessionId,
        state,
        // In a real app, you might want to be more selective about what user data is returned
        // userData: onboardingChatbot.getUserData(sessionId)
    });
});

// Webhook for verification status updates
app.post('/api/webhook/verification', (req, res) => {
    const { type, data } = req.body;

    // Handle different types of verification webhooks
    switch (type) {
        case 'kyc_complete':
            eventBus.publish('onboarding.kyc_complete', data, data.sessionId || 'unknown');
            break;
        case 'address_verification_complete':
            eventBus.publish('onboarding.address_verification_complete', data, data.sessionId || 'unknown');
            break;
        default:
            console.warn('Unknown webhook type:', type);
    }

    res.json({ status: 'received' });
});

// Start the server
const server = app.listen(port, () => {
    console.log(`Chatbot server running on port ${port}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default app;
