"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEngine = void 0;
class RulesEngine {
    constructor(rules) {
        this.rules = [];
        this.rules = rules;
    }
    evaluate(context) {
        for (const rule of this.rules) {
            if (rule.condition(context)) {
                return rule.action(context);
            }
        }
        return { approved: false, reasons: ['No matching rules'] };
    }
}
exports.RulesEngine = RulesEngine;
