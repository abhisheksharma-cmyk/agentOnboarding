export type Proposal = "approve" | "deny" | "escalate";

export type SlotName = "KYC" | "AML" | "CREDIT" | "RISK" | "ADDRESS_VERIFICATION";

export interface AgentFlags {
  missing_data?: boolean;
  policy_conflict?: boolean;
  provider_high_risk?: boolean;
  contradictory_signals?: boolean;
  [key: string]: boolean | undefined;
}

// In types.ts
export interface AgentMetadata {
  agent_name: string;
  slot: string;
  version?: string;
  [key: string]: any;  // This allows additional properties
}

export interface AgentOutput {
  proposal: Proposal;
  confidence: number;
  reasons: string[];
  policy_refs: string[];
  flags: Record<string, any>;
  metadata?: {
    agent_name?: string;
    slot?: string;
    verified_address?: string;
    verification_timestamp?: string;
    [key: string]: any;
  };
  // Add these properties to match the Python agent's response
  is_valid?: boolean;
  verified_address?: string;
  suggested_corrections?: string[];
  missing_fields?: string[];
}

export interface AgentContext {
  customerId: string;
  applicationId: string;
  slot: SlotName;
  payload: any;
}

export type FinalDecision = "APPROVE" | "DENY" | "ESCALATE";
