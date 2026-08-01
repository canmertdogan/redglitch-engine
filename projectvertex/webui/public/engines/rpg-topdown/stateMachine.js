// stateMachine.js - Finite State Machine for Game Entities
window.StateMachine = class StateMachine {
    constructor(owner, states) {
        this.owner = owner;
        this.states = states; // { STATE_NAME: { enter: fn, update: fn, exit: fn } }
        this.currentState = null;
        this.currentStateName = null;
        this.timer = 0;
    }

    change(stateName, params) {
        // Exit old state
        if (this.currentState && this.currentState.exit) {
            this.currentState.exit(this.owner);
        }

        // Set new state
        this.currentStateName = stateName;
        this.currentState = this.states[stateName];
        this.timer = 0;

        // Enter new state
        if (this.currentState && this.currentState.enter) {
            this.currentState.enter(this.owner, params);
        }
    }

    update(dt) {
        this.timer += dt;
        if (this.currentState && this.currentState.update) {
            this.currentState.update(this.owner, dt, this.timer);
        }
    }
}