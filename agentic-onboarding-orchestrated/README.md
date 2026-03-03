# Agentic Onboarding Orchestrated

Express + TypeScript onboarding orchestrator for KYC/AML/CREDIT/RISK decisions.

## What changed
The runtime is now composable and config-driven per slot:
- `http`: call external agent APIs
- `local`: in-process fallback logic
- `langgraph`: prompt/model execution via LangGraph

This follows a provider + registry + DI-style pattern from the composable framework guidance so client tool stacks can be swapped by config instead of code rewrites.

## Prerequisites
- Node.js 18+
- npm

## Setup
```bash
npm install
```

The app auto-loads `.env` and `.env.local` from the project root at startup.

## Run
```bash
npm run dev
```

Build:
```bash
npm run build
```

## Config-driven client profiles
Default:
- `config/agents.yaml`

Examples:
- `config/agents.aws.yaml`
- `config/agents.azure.yaml`
- `config/agents.onprem.yaml`

Switch profile at runtime:
```bash
# PowerShell
$env:AGENTS_CONFIG_PATH="config/agents.azure.yaml"
npm run dev
```

## Config structure
- `llm_profiles`: reusable model/provider credentials and defaults.
- `agents.<slot>.active`: active version for each slot.
- `agents.<slot>.versions.<version>.type`: `http | local | langgraph`.
- `agents.<slot>.versions.<version>.langgraph`: prompt + llm profile reference.

## API
- `GET /`
- `POST /onboarding/start`
- `GET /onboarding/trace/:traceId`
- `POST /test/kyc`
- `POST /test/aml`
- `POST /test/credit`
- `POST /test/risk`

## Live demo: credit approve + deny (two users)
Use the demo config so CREDIT runs deterministic local policy logic:

```powershell
$env:AGENTS_CONFIG_PATH="config/agents.demo.yaml"
npm run dev
```

In another terminal:

```bash
npm run demo:credit:calls
```

The script sends two separate calls to `POST /test/credit`:
- `CUS_DEMO_001` -> expected `APPROVE`
- `CUS_DEMO_002` -> expected `DENY`

## Key folders
- `src/agents`: slot wrappers (KYC/AML/CREDIT/RISK/ADDRESS)
- `src/composable`: provider registry + LangGraph executor + generic runtime
- `src/orchestrator`: event-driven workflow
- `src/decisionGateway`: final decision logic
- `config`: slot/provider config profiles
