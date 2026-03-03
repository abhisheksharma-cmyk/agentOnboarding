"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStateTransition = exports.transitionState = exports.createStateMachine = void 0;
const createStateMachine = (context, maxRetries = 3) => ({
    currentState: 'INITIALIZED',
    context,
    history: [{
            state: 'INITIALIZED',
            timestamp: new Date().toISOString()
        }],
    retryCount: 0,
    maxRetries,
    errors: []
});
exports.createStateMachine = createStateMachine;
const transitionState = (machine, event, data) => {
    const newState = getNextState(machine.currentState, event);
    return {
        ...machine,
        currentState: newState,
        history: [
            ...machine.history,
            {
                state: newState,
                timestamp: new Date().toISOString(),
                data
            }
        ]
    };
};
exports.transitionState = transitionState;
const getNextState = (currentState, event) => {
    const transitions = {
        'INITIALIZED': {
            'START': 'KYC_STARTED'
        },
        'KYC_STARTED': {
            'KYC_APPROVED': 'KYC_COMPLETED',
            'KYC_REJECTED': 'COMPLETED'
        },
        'KYC_COMPLETED': {
            'START': 'ADDRESS_VERIFICATION_STARTED'
        },
        'ADDRESS_VERIFICATION_STARTED': {
            'ADDRESS_VERIFIED': 'ADDRESS_VERIFICATION_COMPLETED',
            'ADDRESS_REJECTED': 'COMPLETED'
        },
        'ADDRESS_VERIFICATION_COMPLETED': {
            'START': 'AML_STARTED'
        },
        'AML_STARTED': {
            'AML_APPROVED': 'AML_COMPLETED',
            'AML_REJECTED': 'COMPLETED'
        },
        'AML_COMPLETED': {
            'START': 'CREDIT_STARTED'
        },
        'CREDIT_STARTED': {
            'CREDIT_APPROVED': 'CREDIT_COMPLETED',
            'CREDIT_REJECTED': 'COMPLETED'
        },
        'CREDIT_COMPLETED': {
            'START': 'RISK_STARTED'
        },
        'RISK_STARTED': {
            'COMPLETE': 'COMPLETED'
        },
        'COMPLETED': {}
    };
    const allStates = [
        'INITIALIZED', 'KYC_STARTED', 'KYC_COMPLETED',
        'ADDRESS_VERIFICATION_STARTED', 'ADDRESS_VERIFICATION_COMPLETED',
        'AML_STARTED', 'AML_COMPLETED',
        'CREDIT_STARTED', 'CREDIT_COMPLETED',
        'RISK_STARTED', 'COMPLETED'
    ];
    allStates.forEach(state => {
        if (!transitions[state]) {
            transitions[state] = {};
        }
    });
    const nextState = transitions[currentState]?.[event];
    if (!nextState) {
        throw new Error(`Invalid transition: ${currentState} -> ${event}`);
    }
    return nextState;
};
const logStateTransition = (traceId, fromState, toState, event, data) => {
    console.log(`[${new Date().toISOString()}] [${traceId}] State Transition: ${fromState} -> ${toState} (Event: ${event})`);
    if (data) {
        console.log(`[${new Date().toISOString()}] [${traceId}] Transition Data:`, JSON.stringify(data, null, 2));
    }
};
exports.logStateTransition = logStateTransition;
