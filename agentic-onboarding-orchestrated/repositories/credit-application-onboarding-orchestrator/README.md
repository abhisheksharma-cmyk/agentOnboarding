# Credit Application Onboarding Orchestrator

Standalone reference project for orchestrated credit application onboarding.

## Workflow

The orchestrator executes these steps in sequence:
1. `KYC`
2. `Credit Bureau`
3. `Affordability (FOIR)`
4. `Risk`
5. Final decision from decision gateway

The flow stops early when a stage is not `approve`. Final decisions:
- `APPROVE`
- `DENY`
- `MANUAL_REVIEW`

## Run

```bash
npm install
npm start
```

Default server URL: `http://localhost:4100`

## API

- `GET /`
- `POST /credit-onboarding/start`
- `GET /credit-onboarding/trace/:traceId`

## Example Request

```bash
curl -X POST http://localhost:4100/credit-onboarding/start \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cus_001",
    "applicationId": "app_001",
    "payload": {
      "applicant": {
        "fullName": "Alex Smith",
        "dateOfBirth": "1994-07-05",
        "idNumber": "123412341234",
        "creditScore": 735,
        "monthlyIncome": 90000,
        "monthlyLiabilities": 12000
      },
      "loan": {
        "requestedAmount": 800000,
        "tenureMonths": 60,
        "annualRate": 0.14
      }
    }
  }'
```

## Notes

- This project is intentionally lightweight and uses rule-based local agents.
- Replace local agents with HTTP/LLM agents by swapping implementations inside `src/agents`.
