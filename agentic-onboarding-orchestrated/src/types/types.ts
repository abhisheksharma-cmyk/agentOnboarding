export type Proposal = "approve" | "deny" | "escalate";

export type SlotName = "KYC" | "AML" | "CREDIT" | "RISK";

export interface AgentFlags {
  missing_data?: boolean;
  policy_conflict?: boolean;
  provider_high_risk?: boolean;
  contradictory_signals?: boolean;
  [key: string]: boolean | undefined;
}

export interface AgentOutput {
  proposal: Proposal;
  confidence: number;
  reasons: string[];
  policy_refs: string[];
  flags?: AgentFlags;
  metadata?: {
    agent_name?: string;
    version?: string;
    slot?: SlotName | string;
  };
}

export interface AgentContext {
  customerId: string;
  applicationId: string;
  slot: SlotName;
  payload: any;
}

export type FinalDecision = "APPROVE" | "DENY" | "ESCALATE";
