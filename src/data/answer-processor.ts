/**
 * Pure answer processing logic extracted from AppContext.
 * No React dependency — fully testable in Node/Bun.
 */

import { DataLayer } from "./data-layer.ts";
import type {
  Configuration,
  Pool,
  QuestionState,
  NextQuestionResult,
  EventType,
} from "./data-layer.ts";

export interface AnswerResult {
  correct: boolean;
  newPool: Pool;
  oldPool: Pool;
  snoozeUntil: number;
  snoozeDurationMinutes: number;
  stateUpdates: Partial<QuestionState>;
  needsTestPoolRefill: boolean;
  events: { type: EventType; details: Record<string, unknown> }[];
}

export function processAnswerPure(
  result: NextQuestionResult,
  selectedAnswer: string,
  config: Configuration,
  now: number,
): AnswerResult {
  const correct = selectedAnswer === result.question.correct_option;
  const state = result.state;
  const pool = state.pool as Pool;

  let snoozeDurationMinutes: number;
  let newPool: Pool = pool;
  let newConsecutiveCorrect = state.consecutive_correct;
  let newConsecutiveIncorrect = state.consecutive_incorrect ?? 0;
  let wasDemotedReset = false;
  let needsTestPoolRefill = false;

  const events: { type: EventType; details: Record<string, unknown> }[] = [];

  if (correct) {
    newConsecutiveCorrect += 1;
    newConsecutiveIncorrect = 0;
    if (pool === "test") {
      snoozeDurationMinutes = config.snooze_test_correct_minutes;
      if (newConsecutiveCorrect >= config.promotion_consecutive_correct) {
        newPool = "learned";
        newConsecutiveCorrect = 0;
        wasDemotedReset = true;
        needsTestPoolRefill = true;
        events.push({
          type: "promotion",
          details: {
            question_id: state.question_id,
            from: "test",
            to: "learned",
          },
        });
      }
    } else if (pool === "learned") {
      snoozeDurationMinutes = DataLayer.hoursToMinutes(
        config.snooze_learned_correct_hours,
      );
      if (newConsecutiveCorrect >= config.promotion_consecutive_correct) {
        newPool = "master";
        newConsecutiveCorrect = 0;
        wasDemotedReset = true;
        events.push({
          type: "promotion",
          details: {
            question_id: state.question_id,
            from: "learned",
            to: "master",
          },
        });
      }
    } else {
      snoozeDurationMinutes = DataLayer.daysToMinutes(
        config.snooze_master_correct_days,
      );
    }
  } else {
    newConsecutiveCorrect = 0;
    newConsecutiveIncorrect += 1;
    snoozeDurationMinutes = config.snooze_incorrect_minutes;
    if (
      pool === "master" &&
      newConsecutiveIncorrect >= config.demotion_incorrect_count
    ) {
      newPool = "learned";
      newConsecutiveIncorrect = 0;
      events.push({
        type: "demotion",
        details: {
          question_id: state.question_id,
          from: "master",
          to: "learned",
        },
      });
    } else if (
      pool === "learned" &&
      newConsecutiveIncorrect >= config.demotion_incorrect_count
    ) {
      newPool = "test";
      newConsecutiveIncorrect = 0;
      events.push({
        type: "demotion",
        details: {
          question_id: state.question_id,
          from: "learned",
          to: "test",
        },
      });
    }
  }

  const snoozeUntil = DataLayer.calculateSnoozeUntil(
    now,
    snoozeDurationMinutes,
  );

  const wasDemoted =
    !correct && newPool !== pool && (pool === "master" || pool === "learned");

  const stateUpdates: Partial<QuestionState> = {
    pool: newPool,
    last_shown: now,
    snooze_until: snoozeUntil,
    consecutive_correct: newConsecutiveCorrect,
    consecutive_incorrect: newConsecutiveIncorrect,
    total_interactions: state.total_interactions + 1,
    ...(wasDemoted
      ? { was_demoted: true }
      : wasDemotedReset
        ? { was_demoted: false }
        : {}),
  };

  return {
    correct,
    newPool,
    oldPool: pool,
    snoozeUntil,
    snoozeDurationMinutes,
    stateUpdates,
    needsTestPoolRefill,
    events,
  };
}
