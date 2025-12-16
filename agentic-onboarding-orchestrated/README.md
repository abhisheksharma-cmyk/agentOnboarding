# Agentic Onboarding Orchestrated

Express-based reference app that orchestrates multiple underwriting agents (KYC/AML/Credit/Risk) and exposes onboarding endpoints with audit tracing.

## Prerequisites
- Node.js 18+ and npm
- A `GROQ_API_KEY` in `.env` if you run agents that call Groq-backed models (see `.env`).

## Setup
1) Install dependencies:
```bash
npm install
```
2) Add env vars (copy `.env` and fill values as needed):
```bash
cp .env .env.local   # optional, or edit .env directly
```

## Run
- Development (TS, watchless):
```bash
npm run dev
```
- Build TypeScript to `dist`:
```bash
npm run build
```
- Start compiled server:
```bash
npm start
```
The server defaults to `http://localhost:4000` (override with `PORT`).

## API (happy-path demo)
- `GET /` � health/status.
- `POST /onboarding/start` � kicks off full onboarding flow; returns `traceId` plus result/audit after a short delay.
- `GET /onboarding/trace/:traceId` � fetches status/result/audit by trace id.
- `POST /test/kyc` | `/test/aml` | `/test/credit` | `/test/risk` � run a single agent and return its decision plus the decision gateway result.

## Project layout
- `src/index.ts` � Express entrypoint and routes
- `src/workflows` � onboarding workflow wiring
- `src/agents` � mock agent implementations
- `src/decisionGateway` � combines agent outputs into final decisions
- `src/auditTracking` � trace/audit utilities

## Notes
- Formatting on save is enabled via `.vscode/settings.json`.
- TypeScript config outputs to `dist` (`npm run build` required before `npm start`).


next steps - 
1) enable document passing to the agent and giving it the ability to scan it and respond on it
2) UI intigeration 
3) refine the agentic responses to meet the contract and acheive good and satisfactory processing and outcome overall 

4) create a top level card application service, that would record and keep track of all the applications 
5) enable User enrolment workflow and database so user can retrieve the draft level application and its status 
6) integrate with DB record keeping and caching mechanisms
7) create a screen for human under writer, with all documents visible to him, for happy path and non happy path workflows

8) add api integration for agents for credit query cibil api and kyc aadhar api 

calling credit 2 agent

curl -X POST http://localhost:5007/agents/credit2/decide   -H "Content-Type: application/json"   -d '{
    "input": {
      "context": {
        "payload": {
          "applicant": {
            "monthly_income": 60000,
            "monthly_liabilities": 8000,
            "cibil_score": 710
          },
          "credit": {
            "requested_amount": 800000,
            "tenure_months": 60,
            "annual_rate": 0.15
          }
        }
      }
    }
  }'

output:
{"proposal":"approve","confidence":0.8,"reasons":["Income is reasonable","CIBIL score is good","Requested amount is within eligible limits"],"policy_refs":["FOIR 55%"],"flags":{"missing_data":false,"contradictory_signals":false},"max_eligible_amount":1200000,"metadata":{"agent_name":"mock_credit2_http","slot":"CREDIT","version":"2.0.0"}}

calling aml2 agent :
curl -X POST http://localhost:5006/agents/aml2/decide \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "context": {
        "payload": {
          "applicant": { "name": "Jane Doe", "country": "IN", "residencyCountry": "IN", "pepStatus": "none" },
          "documents": [ { "type": "passport", "looks_authentic": true } ],
          "signals": { "watchlist_hit": false, "monthly_cash_volume": 5000 }
        }
      }
    }
  }'


calling kyc2 agent:
curl -X POST http://localhost:5005/agents/kyc2/decide \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "context": {
        "payload": {
          "applicant": { "name": "Prakash Ranjan", "dob": "1994-07-05", "gender": "male" },
          "documents": [
            { "type": "aadhaar", "number": "918300746619", "name": "Prakash Ranjan", "dob": "05/07/1994", "gender": "male" },
            { "type": "pan", "number": "ABCDE1234F", "name": "Sample Name", "dob": "01/01/1990" }
          ]
        }
      }
    }
  }'



