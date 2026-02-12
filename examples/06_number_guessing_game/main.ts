import { createInterface } from "node:readline";
import {
  type Action,
  BaseEngine,
  err,
  type Meta,
  ok,
  type Result,
  type Rule,
  type State,
  type View,
} from "@nodegame/core";

// --- 1. Define State ---
interface GuessState extends State {
  secretNumber: number;
  attempts: number;
  lastGuess: number | null;
  status: "PLAYING" | "WON" | "LOST";
  maxAttempts: number;
}

// --- 2. Define Actions ---
interface GuessAction extends Action {
  type: "GUESS";
  payload: number;
}

// --- 3. Define Logic (Rule) ---
class GuessRule implements Rule<GuessState, GuessAction> {
  isLegal(state: GuessState, action: GuessAction, _meta: Meta): Result<void> {
    if (state.status !== "PLAYING") return err("Game is over");

    if (action.type === "GUESS") {
      const guess = action.payload;
      if (!Number.isInteger(guess)) return err("Guess must be an integer");
      if (guess < 1 || guess > 100)
        return err("Guess must be between 1 and 100");
      return ok(undefined);
    }
    return err("Unknown action");
  }

  apply(state: GuessState, action: GuessAction, _meta: Meta): GuessState {
    if (action.type === "GUESS") {
      const guess = action.payload;
      const newAttempts = state.attempts + 1;
      let newStatus = state.status;

      if (guess === state.secretNumber) {
        newStatus = "WON";
      } else if (newAttempts >= state.maxAttempts) {
        newStatus = "LOST";
      }

      return {
        ...state,
        attempts: newAttempts,
        lastGuess: guess,
        status: newStatus,
      };
    }
    return state;
  }
}

// --- 4. Define View (Observation) ---
// The player should NOT see the secret number until the game is over.
interface PlayerView {
  attempts: number;
  lastGuess: number | null;
  status: "PLAYING" | "WON" | "LOST";
  maxAttempts: number;
  feedback?: "TOO_HIGH" | "TOO_LOW" | "CORRECT";
}

class GuessView implements View<GuessState, PlayerView> {
  observe(state: GuessState, _playerId: string): PlayerView {
    let feedback: "TOO_HIGH" | "TOO_LOW" | "CORRECT" | undefined;

    if (state.lastGuess !== null) {
      if (state.lastGuess > state.secretNumber) feedback = "TOO_HIGH";
      else if (state.lastGuess < state.secretNumber) feedback = "TOO_LOW";
      else feedback = "CORRECT";

      // If lost, maybe reveal the number? For now, stick to simple view.
    }

    return {
      attempts: state.attempts,
      lastGuess: state.lastGuess,
      status: state.status,
      maxAttempts: state.maxAttempts,
      feedback,
    };
  }
}

// --- 5. Implement Engine ---
class NumberGuessingEngine extends BaseEngine<
  GuessState,
  GuessAction,
  PlayerView
> {
  protected rule = new GuessRule();
  protected view = new GuessView();

  constructor() {
    // Generate random secret for single player demo
    // In a real P2P game, this would be set via Commit-Reveal or T0 config
    const secret = Math.floor(Math.random() * 100) + 1;
    super({
      tick: 0,
      secretNumber: secret,
      attempts: 0,
      lastGuess: null,
      status: "PLAYING",
      maxAttempts: 10,
    });
  }

  decodeAction(payload: unknown): GuessAction {
    return payload as GuessAction;
  }
}

async function main() {
  const engine = new NumberGuessingEngine();
  let state = engine.initialState;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Welcome to Number Guessing Game (CLI Engine Demo)");
  console.log("Guess a number between 1 and 100. You have 10 attempts.");

  const ask = () => {
    // Get view for player "me"
    const view = engine.observe(state, "me");

    if (view.status === "WON") {
      console.log(`\n🎉 You WON! The number was ${view.lastGuess}.`);
      rl.close();
      return;
    }
    if (view.status === "LOST") {
      console.log(`\n💀 You LOST! Max attempts reached.`);
      // In a real game we'd reveal it here, but view hides it.
      // We can access state directly since we are the host/local runner.
      console.log(`The secret number was ${state.secretNumber}.`);
      rl.close();
      return;
    }

    if (view.feedback) {
      console.log(`Last guess ${view.lastGuess} was ${view.feedback}.`);
    }

    rl.question(
      `Attempt ${view.attempts + 1}/${view.maxAttempts}: `,
      (answer) => {
        const num = parseInt(answer, 10);
        if (isNaN(num)) {
          console.log("Please enter a valid number.");
          ask();
          return;
        }

        const action: GuessAction = { type: "GUESS", payload: num };
        const meta: Meta = { from: "me", tick: state.tick + 1 }; // Simple bump

        const result = engine.isLegal(state, action, meta);
        if (!result.ok) {
          console.log(`Invalid move: ${result.error}`);
          ask();
          return;
        }

        state = engine.reduce(state, action, meta);
        ask();
      },
    );
  };

  ask();
}

main();
