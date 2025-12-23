import { AgentContext, AgentOutput } from "../types/types";

export type OnboardingState =
    | 'INITIALIZED'
    | 'KYC_STARTED'
    | 'KYC_COMPLETED'
    | 'ADDRESS_VERIFICATION_STARTED'
    | 'ADDRESS_VERIFICATION_COMPLETED'
    | 'AML_STARTED'
    | 'AML_COMPLETED'
    | 'CREDIT_STARTED'
    | 'CREDIT_COMPLETED'
    | 'RISK_STARTED'
    | 'COMPLETED';

export type OnboardingEvent =
    | 'START'
    | 'KYC_APPROVED'
    | 'KYC_REJECTED'
    | 'ADDRESS_VERIFIED'
    | 'ADDRESS_REJECTED'
    | 'AML_APPROVED'
    | 'AML_REJECTED'
    | 'CREDIT_APPROVED'
    | 'CREDIT_REJECTED'
    | 'COMPLETE';

export interface OnboardingStateMachine {
    currentState: OnboardingState;
    context: AgentContext;
    history: {
        state: OnboardingState;
        timestamp: string;
        data?: any;
    }[];
    retryCount: number;
    maxRetries: number;
    errors: Error[];
}

export const createStateMachine = (context: AgentContext, maxRetries = 3): OnboardingStateMachine => ({
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

export const transitionState = (
    machine: OnboardingStateMachine,
    event: OnboardingEvent,
    data?: any
): OnboardingStateMachine => {
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

const getNextState = (currentState: OnboardingState, event: OnboardingEvent): OnboardingState => {
    const transitions: Record<OnboardingState, Partial<Record<OnboardingEvent, OnboardingState>>> = {
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

    const allStates: OnboardingState[] = [
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

export const logStateTransition = (
    traceId: string,
    fromState: OnboardingState,
    toState: OnboardingState,
    event: OnboardingEvent,
    data?: any
) => {
    console.log(`[${new Date().toISOString()}] [${traceId}] State Transition: ${fromState} -> ${toState} (Event: ${event})`);
    if (data) {
        console.log(`[${new Date().toISOString()}] [${traceId}] Transition Data:`, JSON.stringify(data, null, 2));
    }
};
