const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Request timeout middleware
const TIMEOUT = 10000; // 10 seconds
app.use((req, res, next) => {
    res.setTimeout(TIMEOUT, () => {
        if (!res.headersSent) {
            res.status(504).json({
                error: 'Request timeout',
                message: 'The server timed out while processing your request.'
            });
        }
    });
    next();
});

// Input validation middleware
const validateAddress = [
    body('line1').trim().notEmpty().withMessage('Street address is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('postalCode').trim().notEmpty().withMessage('ZIP code is required')
        .matches(/^\d{5}(-\d{4})?$/).withMessage('Invalid ZIP code format'),
    body('country').trim().notEmpty().withMessage('Country is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(err => err.msg);
            return res.status(400).json({
                is_valid: false,
                error: 'Validation failed',
                messages: errorMessages,
                timestamp: new Date().toISOString()
            });
        }
        next();
    }
];

// Mock address database for validation
const MOCK_ADDRESS_DB = {
    '123 Main St': { city: 'New York', state: 'NY', postalCode: '10001', country: 'USA' },
    '456 Oak Ave': { city: 'Los Angeles', state: 'CA', postalCode: '90001', country: 'USA' },
    '789 Pine Rd': { city: 'Chicago', state: 'IL', postalCode: '60601', country: 'USA' }
};

/**
 * @route POST /verify-address
 * @description Verify and standardize an address
 * @param {string} line1 - Street address
 * @param {string} city - City name
 * @param {string} state - State/Province code
 * @param {string} postalCode - ZIP/Postal code
 * @param {string} country - Country name
 * @returns {Object} Verification result with address details
 */
app.post('/verify-address', validateAddress, async (req, res) => {
    try {
        const { line1, city, state, postalCode, country } = req.body;

        // Simulate API call delay (50ms - 500ms)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 450));

        // Check against mock database
        const normalizedAddress = line1.toLowerCase().trim();
        const matchedAddress = Object.entries(MOCK_ADDRESS_DB).find(([addr, _]) =>
            addr.toLowerCase().includes(normalizedAddress) ||
            normalizedAddress.includes(addr.toLowerCase())
        );

        if (matchedAddress) {
            const [matchedAddr, details] = matchedAddress;
            return res.json({
                is_valid: true,
                verified_address: {
                    street: matchedAddr,
                    city: details.city,
                    state: details.state,
                    postalCode: details.postalCode,
                    country: details.country
                },
                confidence: 0.95,
                messages: ['Address verified and standardized'],
                flags: {
                    is_standardized: true,
                    is_high_confidence: true,
                    is_residential: !matchedAddr.toLowerCase().includes('suite') &&
                        !matchedAddr.toLowerCase().match(/\d{3,}/)
                },
                metadata: {
                    verification_method: 'mock_database',
                    timestamp: new Date().toISOString(),
                    request_id: req.id || null
                }
            });
        }

        // If no match, try to standardize the address
        const standardizedAddress = {
            street: line1.replace(/\s+/g, ' ').trim(),
            city: city.charAt(0).toUpperCase() + city.slice(1).toLowerCase(),
            state: state.toUpperCase(),
            postalCode: postalCode,
            country: country.charAt(0).toUpperCase() + country.slice(1).toLowerCase()
        };

        // Check if the address looks valid
        const isLikelyValid = postalCode.match(/^\d{5}(-\d{4})?$/) &&
            state.match(/^[A-Z]{2}$/) &&
            line1.length > 5;

        res.json({
            is_valid: isLikelyValid,
            verified_address: isLikelyValid ? standardizedAddress : null,
            confidence: isLikelyValid ? 0.8 : 0.4,
            messages: [
                isLikelyValid
                    ? 'Address appears to be valid but not found in our database'
                    : 'Address validation failed - unable to verify'
            ],
            flags: {
                is_standardized: isLikelyValid,
                is_high_confidence: isLikelyValid,
                is_residential: !line1.toLowerCase().includes('suite') &&
                    !line1.toLowerCase().match(/\d{3,}/)
            },
            metadata: {
                verification_method: 'heuristic',
                timestamp: new Date().toISOString(),
                request_id: req.id || null
            }
        });

    } catch (error) {
        console.error('Error processing address verification:', error);
        res.status(500).json({
            is_valid: false,
            error: 'Internal server error',
            message: 'An unexpected error occurred while processing your request',
            timestamp: new Date().toISOString(),
            request_id: req.id || null
        });
    }
});

/**
 * @route GET /health
 * @description Health check endpoint
 * @returns {Object} Service status information
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'operational',
        service: 'mock-address-agent',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `The requested resource ${req.originalUrl} was not found`,
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        request_id: req.id || null
    });
});

// Start the server
const server = app.listen(port, () => {
    console.log(` Mock Address Agent running at http://localhost:${port}`);
    console.log(` Health check available at http://localhost:${port}/health`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server };