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
4) run these service on docker images 
5) create a top level card application service, that would record and keep track of all the applications 
6) enable User enrolment workflow and database so user can retrieve the draft level application and its status 
7) integrate with DB record keeping and caching mechanisms
8) create a screen for human under writer, with all documents visible to him, for happy path and non happy path workflows

