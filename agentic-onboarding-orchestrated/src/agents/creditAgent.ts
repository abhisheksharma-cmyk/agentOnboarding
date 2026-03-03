import { AgentContext, AgentOutput } from "../types/types";
import { runConfiguredAgent } from "../composable/runConfiguredAgent";

/**
 * Credit Assessment agent wrapper.
 */
export async function runCreditAgent(ctx: AgentContext): Promise<AgentOutput> {
  return runConfiguredAgent("CREDIT", ctx, async (currentCtx) =>
    runLocalCreditDecision(currentCtx)
  );
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function estimateEmi(principal: number, annualRate: number, months: number): number {
  const p = Math.max(0, principal);
  const m = Math.max(1, months);
  const r = Math.max(0, annualRate) / 12;
  if (r === 0) return p / m;
  const numerator = p * r * Math.pow(1 + r, m);
  const denominator = Math.pow(1 + r, m) - 1;
  return denominator === 0 ? p / m : numerator / denominator;
}

function runLocalCreditDecision(currentCtx: AgentContext): AgentOutput {
  const payload = currentCtx.payload || {};
  const applicant = payload.applicant || {};
  const credit = payload.credit || payload.loan || {};

  const monthlyIncome = toNumber(
    applicant.monthly_income ?? applicant.income_monthly ?? payload.declaredIncome
  );
  const monthlyLiabilities = toNumber(
    applicant.monthly_liabilities ?? applicant.emi_outflow ?? 0
  );
  const cibilScore = toNumber(
    applicant.cibil_score ?? credit.cibil_score ?? credit.bureau_score
  );
  const requestedAmount = toNumber(credit.requested_amount ?? credit.amount);
  const tenureMonths = toNumber(credit.tenure_months ?? credit.tenure ?? 60, 60);
  const annualRate = toNumber(credit.annual_rate ?? credit.interest_rate ?? 0.16, 0.16);

  if (!monthlyIncome || !cibilScore || !requestedAmount) {
    return {
      proposal: "escalate",
      confidence: 0.65,
      reasons: ["Missing minimum credit inputs (income, bureau score, or requested amount)"],
      policy_refs: ["CREDIT-INPUT-01"],
      flags: { missing_data: true },
      metadata: { agent_name: "credit_local_policy", slot: "CREDIT" },
    };
  }

  const newLoanEmi = estimateEmi(requestedAmount, annualRate, tenureMonths);
  const totalEmiOutflow = monthlyLiabilities + newLoanEmi;
  const foir = totalEmiOutflow / monthlyIncome;

  if (cibilScore < 580 || foir > 0.7) {
    return {
      proposal: "deny",
      confidence: 0.92,
      reasons: [
        cibilScore < 580
          ? `Bureau score too low (${cibilScore})`
          : `FOIR too high (${(foir * 100).toFixed(1)}%)`,
      ],
      policy_refs: ["CREDIT-RISK-01"],
      flags: { policy_conflict: true, missing_data: false },
      metadata: { agent_name: "credit_local_policy", slot: "CREDIT", foir },
    };
  }

  if (cibilScore >= 700 && foir <= 0.55) {
    return {
      proposal: "approve",
      confidence: 0.9,
      reasons: [
        `Strong bureau score (${cibilScore})`,
        `FOIR within policy (${(foir * 100).toFixed(1)}%)`,
      ],
      policy_refs: ["CREDIT-POLICY-APPROVE-01"],
      flags: { missing_data: false, contradictory_signals: false },
      metadata: { agent_name: "credit_local_policy", slot: "CREDIT", foir },
    };
  }

  return {
    proposal: "escalate",
    confidence: 0.83,
    reasons: [
      `Borderline profile (score=${cibilScore}, FOIR=${(foir * 100).toFixed(1)}%)`,
    ],
    policy_refs: ["CREDIT-ESCALATE-01"],
    flags: { contradictory_signals: true },
    metadata: { agent_name: "credit_local_policy", slot: "CREDIT", foir },
  };
}
