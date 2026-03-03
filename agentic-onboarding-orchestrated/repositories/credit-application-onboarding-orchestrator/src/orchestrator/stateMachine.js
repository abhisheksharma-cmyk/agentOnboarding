const STATE = {
  INITIALIZED: "INITIALIZED",
  KYC_STARTED: "KYC_STARTED",
  KYC_COMPLETED: "KYC_COMPLETED",
  BUREAU_STARTED: "BUREAU_STARTED",
  BUREAU_COMPLETED: "BUREAU_COMPLETED",
  AFFORDABILITY_STARTED: "AFFORDABILITY_STARTED",
  AFFORDABILITY_COMPLETED: "AFFORDABILITY_COMPLETED",
  RISK_STARTED: "RISK_STARTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
};

const EVENT = {
  START: "START",
  KYC_APPROVED: "KYC_APPROVED",
  KYC_REJECTED: "KYC_REJECTED",
  BUREAU_APPROVED: "BUREAU_APPROVED",
  BUREAU_REJECTED: "BUREAU_REJECTED",
  AFFORDABILITY_APPROVED: "AFFORDABILITY_APPROVED",
  AFFORDABILITY_REJECTED: "AFFORDABILITY_REJECTED",
  COMPLETE: "COMPLETE",
  FAIL: "FAIL"
};

const transitions = {
  [STATE.INITIALIZED]: {
    [EVENT.START]: STATE.KYC_STARTED
  },
  [STATE.KYC_STARTED]: {
    [EVENT.KYC_APPROVED]: STATE.KYC_COMPLETED,
    [EVENT.KYC_REJECTED]: STATE.COMPLETED
  },
  [STATE.KYC_COMPLETED]: {
    [EVENT.START]: STATE.BUREAU_STARTED
  },
  [STATE.BUREAU_STARTED]: {
    [EVENT.BUREAU_APPROVED]: STATE.BUREAU_COMPLETED,
    [EVENT.BUREAU_REJECTED]: STATE.COMPLETED
  },
  [STATE.BUREAU_COMPLETED]: {
    [EVENT.START]: STATE.AFFORDABILITY_STARTED
  },
  [STATE.AFFORDABILITY_STARTED]: {
    [EVENT.AFFORDABILITY_APPROVED]: STATE.AFFORDABILITY_COMPLETED,
    [EVENT.AFFORDABILITY_REJECTED]: STATE.COMPLETED
  },
  [STATE.AFFORDABILITY_COMPLETED]: {
    [EVENT.START]: STATE.RISK_STARTED
  },
  [STATE.RISK_STARTED]: {
    [EVENT.COMPLETE]: STATE.COMPLETED
  },
  [STATE.COMPLETED]: {},
  [STATE.FAILED]: {}
};

function createStateMachine(context) {
  return {
    currentState: STATE.INITIALIZED,
    context,
    history: [
      {
        state: STATE.INITIALIZED,
        at: new Date().toISOString()
      }
    ]
  };
}

function transitionState(machine, event, data) {
  const nextState = transitions[machine.currentState] && transitions[machine.currentState][event];
  if (!nextState) {
    throw new Error(`Invalid transition: ${machine.currentState} -> ${event}`);
  }
  return {
    ...machine,
    currentState: nextState,
    history: machine.history.concat([
      {
        state: nextState,
        event,
        at: new Date().toISOString(),
        data
      }
    ])
  };
}

module.exports = { STATE, EVENT, createStateMachine, transitionState };
