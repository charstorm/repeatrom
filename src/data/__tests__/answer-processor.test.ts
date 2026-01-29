import { describe, it, expect } from "vitest";
import { processAnswerPure } from "../answer-processor.ts";
import type {
  Configuration,
  NextQuestionResult,
  QuestionState,
  OriginalQuestion,
} from "../data-layer.ts";

function makeConfig(overrides?: Partial<Configuration>): Configuration {
  return {
    id: "global",
    test_pool_target_size: 40,
    snooze_incorrect_minutes: 1,
    snooze_test_correct_minutes: 5,
    snooze_learned_correct_hours: 1,
    snooze_master_correct_days: 2,
    pool_weight_test: 12,
    pool_weight_learned: 4,
    pool_weight_master: 1,
    pool_penalty_threshold: 8,
    strategy_oldest_pct: 30,
    strategy_demoted_pct: 30,
    promotion_consecutive_correct: 2,
    demotion_incorrect_count: 1,
    auto_next_correct: false,
    auto_next_delay_ms: 1000,
    ...overrides,
  };
}

function makeQuestion(overrides?: Partial<OriginalQuestion>): OriginalQuestion {
  return {
    course_id: "c1",
    id: 1,
    question: "What is 2+2?",
    options: ["3", "4", "5"],
    correct_option: "4",
    explanation: "Basic math",
    ...overrides,
  };
}

function makeState(overrides?: Partial<QuestionState>): QuestionState {
  return {
    course_id: "c1",
    question_id: 1,
    pool: "test",
    last_shown: null,
    snooze_until: null,
    hidden: false,
    notes: "",
    consecutive_correct: 0,
    consecutive_incorrect: 0,
    total_interactions: 0,
    was_demoted: false,
    ...overrides,
  };
}

function makeResult(
  stateOverrides?: Partial<QuestionState>,
  questionOverrides?: Partial<OriginalQuestion>,
): NextQuestionResult {
  return {
    question: makeQuestion(questionOverrides),
    state: makeState(stateOverrides),
    strategy: "random",
  };
}

const NOW = 1700000000000;

describe("processAnswerPure", () => {
  describe("correct answers", () => {
    it("increments consecutive_correct on correct answer", () => {
      const r = processAnswerPure(makeResult(), "4", makeConfig(), NOW);
      expect(r.correct).toBe(true);
      expect(r.stateUpdates.consecutive_correct).toBe(1);
      expect(r.stateUpdates.consecutive_incorrect).toBe(0);
    });

    it("promotes test→learned after reaching promotion threshold", () => {
      const r = processAnswerPure(
        makeResult({ consecutive_correct: 1 }),
        "4",
        makeConfig(),
        NOW,
      );
      expect(r.newPool).toBe("learned");
      expect(r.stateUpdates.consecutive_correct).toBe(0);
      expect(r.needsTestPoolRefill).toBe(true);
      expect(r.events).toHaveLength(1);
      expect(r.events[0].type).toBe("promotion");
    });

    it("promotes learned→master after reaching threshold", () => {
      const r = processAnswerPure(
        makeResult({ pool: "learned", consecutive_correct: 1 }),
        "4",
        makeConfig(),
        NOW,
      );
      expect(r.newPool).toBe("master");
      expect(r.events[0].details.from).toBe("learned");
      expect(r.events[0].details.to).toBe("master");
    });

    it("does not promote if below threshold", () => {
      const r = processAnswerPure(
        makeResult({ pool: "test", consecutive_correct: 0 }),
        "4",
        makeConfig({ promotion_consecutive_correct: 3 }),
        NOW,
      );
      expect(r.newPool).toBe("test");
      expect(r.stateUpdates.consecutive_correct).toBe(1);
      expect(r.events).toHaveLength(0);
    });

    it("applies correct snooze for master pool", () => {
      const r = processAnswerPure(
        makeResult({ pool: "master" }),
        "4",
        makeConfig({ snooze_master_correct_days: 2 }),
        NOW,
      );
      expect(r.snoozeDurationMinutes).toBe(2 * 24 * 60);
    });

    it("clears was_demoted on promotion", () => {
      const r = processAnswerPure(
        makeResult({ pool: "test", consecutive_correct: 1, was_demoted: true }),
        "4",
        makeConfig(),
        NOW,
      );
      expect(r.stateUpdates.was_demoted).toBe(false);
    });
  });

  describe("incorrect answers", () => {
    it("resets consecutive_correct on wrong answer", () => {
      const r = processAnswerPure(
        makeResult({ consecutive_correct: 5 }),
        "3",
        makeConfig(),
        NOW,
      );
      expect(r.correct).toBe(false);
      expect(r.stateUpdates.consecutive_correct).toBe(0);
    });

    it("demotes master→learned on incorrect", () => {
      const r = processAnswerPure(
        makeResult({ pool: "master" }),
        "3",
        makeConfig(),
        NOW,
      );
      expect(r.newPool).toBe("learned");
      expect(r.events[0].type).toBe("demotion");
    });

    it("demotes learned→test on incorrect", () => {
      const r = processAnswerPure(
        makeResult({ pool: "learned" }),
        "3",
        makeConfig(),
        NOW,
      );
      expect(r.newPool).toBe("test");
    });

    it("does not demote test pool further", () => {
      const r = processAnswerPure(
        makeResult({ pool: "test" }),
        "3",
        makeConfig(),
        NOW,
      );
      expect(r.newPool).toBe("test");
      expect(r.events).toHaveLength(0);
    });

    it("sets was_demoted on demotion", () => {
      const r = processAnswerPure(
        makeResult({ pool: "master" }),
        "3",
        makeConfig(),
        NOW,
      );
      expect(r.stateUpdates.was_demoted).toBe(true);
    });

    it("respects demotion_incorrect_count > 1", () => {
      const r = processAnswerPure(
        makeResult({ pool: "master", consecutive_incorrect: 0 }),
        "3",
        makeConfig({ demotion_incorrect_count: 2 }),
        NOW,
      );
      // Only 1 incorrect, threshold is 2 → no demotion
      expect(r.newPool).toBe("master");
      expect(r.stateUpdates.consecutive_incorrect).toBe(1);
    });

    it("applies incorrect snooze", () => {
      const r = processAnswerPure(
        makeResult(),
        "3",
        makeConfig({ snooze_incorrect_minutes: 5 }),
        NOW,
      );
      expect(r.snoozeDurationMinutes).toBe(5);
      expect(r.snoozeUntil).toBe(NOW + 5 * 60 * 1000);
    });
  });

  describe("total_interactions", () => {
    it("increments total_interactions", () => {
      const r = processAnswerPure(
        makeResult({ total_interactions: 7 }),
        "4",
        makeConfig(),
        NOW,
      );
      expect(r.stateUpdates.total_interactions).toBe(8);
    });
  });
});
