const gw = require('../dist/decisionGateway/decisionGateway.js');

function run() {
  const ctxHigh = {
    customerId: 'c',
    applicationId: 'a',
    slot: 'KYC',
    payload: {
      riskProfile: 'High Risk',
      applicant: {
        fullName: 'John Doe',
        gender: 'male',
        dateOfBirth: '1990-01-02',
        address: {
          line1: '123 Main',
          city: 'X',
          state: 'Y',
          postalCode: '12345',
          country: 'US'
        }
      },
      documents: [
        {
          fullName: 'John Doe',
          gender: 'male',
          dateOfBirth: '1990-01-02',
          address: {
            line1: '123 Main',
            city: 'X',
            state: 'Y',
            postalCode: '12345',
            country: 'US'
          }
        }
      ]
    }
  };

  const out = {
    proposal: 'escalate',
    confidence: 0.1,
    reasons: [],
    policy_refs: [],
    flags: {},
    metadata: {}
  };

  const ctxLow = {
    customerId: 'c',
    applicationId: 'a',
    slot: 'KYC',
    payload: {
      riskProfile: 'low risk',
      applicant: {
        fullName: 'John Doe',
        gender: 'male',
        dateOfBirth: '1990-01-02',
        address: {
          line1: '123 Main',
          city: 'X',
          state: 'Y',
          postalCode: '12345',
          country: 'US'
        }
      },
      documents: [
        {
          fullName: 'John Doe',
          gender: 'male',
          dateOfBirth: '1990-01-02',
          address: {
            line1: '123 Main',
            city: 'X',
            state: 'Y',
            postalCode: '12345',
            country: 'US'
          }
        }
      ]
    }
  };

  console.log('High risk match =>', gw.evaluateDecision(out, ctxHigh));
  console.log('Low risk =>', gw.evaluateDecision(out, ctxLow));
}

run();
