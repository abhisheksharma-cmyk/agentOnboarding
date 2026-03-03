interface LoanDecision {
    approved: boolean;
    reasons: string[];
    // Optional fields that might be used in your application
    score?: number;
    message?: string;
}

interface Rule {
    condition: (context: any) => boolean;
    action: (context: any) => LoanDecision;
}

export class RulesEngine {
    private rules: Rule[] = [];

    constructor(rules: Rule[]) {
        this.rules = rules;
    }

    evaluate(context: any): LoanDecision {
        for (const rule of this.rules) {
            if (rule.condition(context)) {
                return rule.action(context);
            }
        }
        return { approved: false, reasons: ['No matching rules'] };
    }
}