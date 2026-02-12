import { describe, expect, it } from "vitest";
import { BaseEngine } from "../src/engine/base-engine.js";
import type { Rule } from "../src/engine/rule.js";
import type { System } from "../src/engine/system.js";
import {
  type Action,
  err,
  type Meta,
  ok,
  type Result,
  type State,
} from "../src/engine/types.js";

// 1. Define Test Types
interface CounterState extends State {
  count: number;
}
interface IncAction extends Action {
  type: "INC";
  payload: number; // amount
}

// 2. Define Rule
class CounterRule implements Rule<CounterState, IncAction> {
  isLegal(state: CounterState, action: IncAction, _meta: Meta): Result<void> {
    if (action.type === "INC") {
      if (state.count >= 100) return err("Max count reached");
      return ok(undefined);
    }
    return ok(undefined);
  }

  apply(state: CounterState, action: IncAction, _meta: Meta): CounterState {
    if (action.type === "INC") {
      return { ...state, count: state.count + action.payload };
    }
    return state;
  }
}

// 3. Define System
class DoublerSystem implements System<CounterState> {
  update(state: CounterState, _meta: Meta): CounterState {
    // If count is exactly 10, double it to 20!
    if (state.count === 10) {
      return { ...state, count: 20 };
    }
    return state;
  }
}

// 4. Implement Engine
class CounterEngine extends BaseEngine<CounterState, IncAction> {
  protected rule = new CounterRule();
  protected view = { observe: (s: CounterState) => s };

  constructor() {
    super({ tick: 0, count: 0 });
  }

  decodeAction(payload: unknown): IncAction {
    return payload as IncAction;
  }
}

describe("BaseEngine Architecture", () => {
  it("should process actions and update state via Rule", () => {
    const engine = new CounterEngine();
    let state = engine.initialState;
    const meta: Meta = { from: "tester", tick: 1 };

    state = engine.reduce(state, { type: "INC", payload: 1 }, meta);
    expect(state.count).toBe(1);

    state = engine.reduce(state, { type: "INC", payload: 5 }, meta);
    expect(state.count).toBe(6);
  });

  it("should execute systems in the pipeline", () => {
    const engine = new CounterEngine();
    engine.addSystem(new DoublerSystem());

    let state = engine.initialState;
    const meta: Meta = { from: "tester", tick: 1 };

    // Reach 9
    state = engine.reduce(state, { type: "INC", payload: 9 }, meta);
    expect(state.count).toBe(9);

    // Reach 10 -> System triggers -> 20
    state = engine.reduce(state, { type: "INC", payload: 1 }, meta);
    expect(state.count).toBe(20);
  });

  it("should respect isLegal validation", () => {
    const engine = new CounterEngine();
    const state: CounterState = { tick: 0, count: 100 };
    const meta: Meta = { from: "tester", tick: 1 };

    const result = engine.isLegal(state, { type: "INC", payload: 1 }, meta);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Max count reached");
    }

    // reduce should handle it gracefully (by not applying change, usually)
    // Note: BaseEngine logs warning but returns state as is if check fails inside reduce
    // Verify that behavior:
    const nextState = engine.reduce(state, { type: "INC", payload: 1 }, meta);
    expect(nextState).toBe(state); // Reference equality or value equality
    expect(nextState.count).toBe(100);
  });
});
