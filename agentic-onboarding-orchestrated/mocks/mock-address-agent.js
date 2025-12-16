const express = require('express');
const cors = require('cors');
const app = express();
const port = 5000;

// Enable CORS
app.use(cors());
app.use(express.json());

app.post('/verify-address', (req, res) => {
    console.log('Received request:', req.body);

    // Simulate processing delay
    setTimeout(() => {
        const { address, city, state, zipCode, country } = req.body;

        // Check for required fields
        if (!address || !city || !state || !zipCode || !country) {
            return res.status(400).json({
                is_valid: false,
                verified_address: "",
                confidence: 0.1,
                reasons: ["Missing required address fields"],
                flags: {
                    missing_fields: !address ? ['address'] :
                        !city ? ['city'] :
                            !state ? ['state'] :
                                !zipCode ? ['zipCode'] : ['country']
                }
            });
        }

        // Simulate a successful verification
        res.json({
            is_valid: true,
            verified_address: `${address}, ${city}, ${state} ${zipCode}, ${country}`,
            confidence: 0.95,
            reasons: ["Address verified successfully"],
            flags: {
                high_confidence: true
            }
        });
    }, 1000);
});
app.listen(port, () => {
    console.log(`Mock Address Agent running at http://localhost:${port}`);
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'mock-address-agent' });
});

app.listen(port, () => {
    console.log(`Mock Address Agent running at http://localhost:${port}`);
});

module.exports = app;