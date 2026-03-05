import { AgentOutput, FinalDecision, AgentContext } from "../types/types";

/**
 * Central place to enforce decision boundaries.
 * Agents can propose, but this function is the final authority.
 * Now considers risk tolerance for more lenient decisions.
 */
export function evaluateDecision(out: AgentOutput, ctx?: AgentContext): FinalDecision {
  const flags = out.flags ?? {};

  // Extract risk tolerance from context
  const riskTolerance = ctx?.payload?.risk_tolerance || ctx?.payload?.riskProfile || 'medium';
  const isHighRisk = riskTolerance.toLowerCase() === 'high';
  const isLowRisk = riskTolerance.toLowerCase() === 'low';

  console.log('[Decision Gateway] Risk Tolerance:', riskTolerance);
  console.log('[Decision Gateway] Proposal:', out.proposal);
  console.log('[Decision Gateway] Confidence:', out.confidence);
  console.log('[Decision Gateway] Flags:', flags);

  // LOW risk tolerance: Always escalate for manual review
  if (isLowRisk) {
    console.log('[Decision Gateway] LOW risk tolerance - escalating for manual review');
    return "ESCALATE";
  }

  // Critical flags that override everything
  if (flags.policy_conflict) {
    console.log('[Decision Gateway] Policy conflict detected - DENY');
    return "DENY";
  }
  if (flags.provider_high_risk) {
    console.log('[Decision Gateway] Provider high risk detected - DENY');
    return "DENY";
  }

  // HIGH risk tolerance: More lenient approval logic
  if (isHighRisk) {
    console.log('[Decision Gateway] HIGH risk tolerance - applying lenient rules');

    // If agent proposes approve, accept it even with lower confidence
    if (out.proposal === 'approve' && out.confidence >= 0.5) {
      console.log('[Decision Gateway] HIGH risk + approve proposal + confidence >= 0.5 - APPROVE');
      return "APPROVE";
    }

    // If confidence is decent and no critical issues, approve
    if (out.confidence >= 0.7 && !flags.contradictory_signals) {
      console.log('[Decision Gateway] HIGH risk + confidence >= 0.7 + no contradictions - APPROVE');
      return "APPROVE";
    }

    // Only escalate if there are contradictory signals or very low confidence
    if (flags.contradictory_signals || out.confidence < 0.4) {
      console.log('[Decision Gateway] HIGH risk but contradictory signals or very low confidence - ESCALATE');
      return "ESCALATE";
    }

    // Default for HIGH risk: approve if not explicitly denied
    if (out.proposal !== 'deny') {
      console.log('[Decision Gateway] HIGH risk + not denied - APPROVE');
      return "APPROVE";
    }
  }

  // MEDIUM risk tolerance: Standard rules
  if (out.confidence < 0.8) {
    console.log('[Decision Gateway] MEDIUM risk + confidence < 0.8 - ESCALATE');
    return "ESCALATE";
  }
  if (!out.flags) {
    console.log('[Decision Gateway] No flags provided - ESCALATE');
    return "ESCALATE";
  }
  if (flags.missing_data) {
    console.log('[Decision Gateway] Missing data - ESCALATE');
    return "ESCALATE";
  }
  if (flags.contradictory_signals) {
    console.log('[Decision Gateway] Contradictory signals - ESCALATE');
    return "ESCALATE";
  }

  // Default: follow proposal
  console.log('[Decision Gateway] Following agent proposal:', out.proposal);
  switch (out.proposal) {
    case "approve":
      return "APPROVE";
    case "deny":
      return "DENY";
    case "escalate":
    default:
      return "ESCALATE";
  }
}
