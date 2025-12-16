// mocks/mock-address-agent.js
const express = require('express');
const cors = require('cors');
const app = express();
const port = 5010;

// System prompt as specified
const SYSTEM_PROMPT = `
You are an address verification assistant. Your task is to verify if the provided address is valid and complete.
For each address, check if it contains all required components:
1. House/Flat number (required)
2. Street name (required)
3. City (required)
4. State/Province (required)
5. Postal/ZIP code (required)
6. Country (required)

For each missing component, add it to the 'missing_fields' array.
If the address is incomplete but can be reasonably completed, provide suggestions in 'suggested_corrections'.
If the address is complete and valid, set 'is_valid' to true.

Return a JSON response with this exact structure:
{
    "is_valid": boolean,
    "missing_fields": [list of missing required fields],
    "suggested_corrections": [list of suggested corrections if any],
    "verified_address": "formatted complete address if valid, empty string if not"
}

Example for "123 Main St":
{
    "is_valid": false,
    "missing_fields": ["city", "state", "zip_code", "country"],
    "suggested_corrections": ["Please add city, state, ZIP code and country for complete verification"],
    "verified_address": ""
}
`;

app.use(cors());
app.use(express.json());

// Mock address verification endpoint
app.post('/verify-address', async (req, res) => {
  try {
    const { address, city, state, zipCode, country } = req.body;

    // Check for missing fields
    const missingFields = [];
    if (!address) missingFields.push('address');
    if (!city) missingFields.push('city');
    if (!state) missingFields.push('state');
    if (!zipCode) missingFields.push('zip_code');
    if (!country) missingFields.push('country');

    const hasMissingFields = missingFields.length > 0;
    const isValid = !hasMissingFields;

    // Create response
    let response = {
      is_valid: isValid,
      missing_fields: missingFields,
      suggested_corrections: [],
      verified_address: ''
    };

    // If valid, format the complete address
    if (isValid) {
      const formattedAddress = `${address}, ${city}, ${state} ${zipCode}, ${country}`.toUpperCase();
      response.verified_address = formattedAddress;

      // 20% chance to suggest a correction even for "valid" addresses
      if (Math.random() < 0.2) {
        const correctedZip = zipCode.replace(/\d/g, d => (d < 9 ? ++d : d));
        response.suggested_corrections.push(
          `ZIP code might be incorrect. Did you mean ${correctedZip}?`
        );
      }
    } else {
      // Provide helpful suggestions for missing fields
      const suggestions = [];
      if (!city) suggestions.push("Please provide the city name");
      if (!state) suggestions.push("Please specify the state/province");
      if (!zipCode) suggestions.push("Please include the ZIP/postal code");
      if (!country) suggestions.push("Please specify the country");

      response.suggested_corrections = suggestions;

      // If address is provided but missing other fields, suggest a complete format
      if (address && !city && !state && !zipCode && !country) {
        response.suggested_corrections.push(
          "Please provide the complete address including city, state, ZIP code, and country"
        );
      }
    }

    // Add small delay to simulate API call
    setTimeout(() => {
      res.json(response);
    }, 300 + Math.random() * 200); // Random delay between 300-500ms

  } catch (error) {
    console.error('Error in mock address verification:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-address-agent',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, () => {
  console.log(`Mock Address Agent running at http://localhost:${port}`);
  console.log('System prompt:', SYSTEM_PROMPT);
});

module.exports = app;