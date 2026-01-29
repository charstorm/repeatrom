import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryDatabase } from "../data-layer-memory.ts";
import { DataLayer } from "../data-layer.ts";
import { processAnswerPure } from "../answer-processor.ts";
import type { NextQuestionResult, Pool } from "../data-layer.ts";

const COURSE_JSON = Array.from({ length: 10 }, (_, i) => ({
  question: `Question ${i + 1}`,
  options: ["A", "B", "C", "D"],
  correct_option: "A",
  explanation: `Explanation ${i + 1}`,
}));

describe("Scenario tests", () => {
  let db: InMemoryDatabase;
  let dl: DataLayer;
  let courseId: string;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    dl = new DataLayer(db);
    await dl.initialize();
    // Use small test pool for faster scenarios
    await dl.updateConfig({ test_pool_target_size: 5 });
    const result = await dl.createCourse("Scenario Course", COURSE_JSON);
    courseId = result.course_id;
  });

  async function answerQuestion(
    result: NextQuestionResult,
    answer: string,
    cid?: string,
  ) {
    const id = cid ?? courseId;
    const config = await dl.getConfig();
    const ar = processAnswerPure(result, answer, config, Date.now());
    for (const event of ar.events) {
      await dl.logEvent(id, event.type, event.details);
    }
    await dl.updateQuestionStateWithPoolTransition(
      id,
      result.state.question_id,
      ar.stateUpdates,
      ar.oldPool,
      ar.newPool,
    );
    return ar;
  }

  it("initial refill populates test pool from latent", async () => {
    const next = await dl.findNextQuestion(courseId);
    expect(next).not.toBeNull();
    const stats = await dl.getCourseStats(courseId);
    expect(stats.test_count).toBe(5);
    expect(stats.latent_count).toBe(5);
  });

  it("answering correctly twice promotes test→learned", async () => {
    // Make deterministic
    db.random = (() => {
      let i = 0;
      return () => [0.1, 0.1][i++ % 2]; // always pick first pool, oldest strategy
    })();

    const q1 = await dl.findNextQuestion(courseId);
    expect(q1).not.toBeNull();
    const qid = q1!.state.question_id;

    // First correct
    await answerQuestion(q1!, "A");
    let state = await dl.getQuestionState(courseId, qid);
    expect(state?.pool).toBe("test");
    expect(state?.consecutive_correct).toBe(1);

    // Need fresh state for second answer
    const q2state = await dl.getQuestionState(courseId, qid);
    const q2: NextQuestionResult = {
      question: q1!.question,
      state: q2state!,
      strategy: "oldest",
    };

    // Second correct → promotion
    const ar = await answerQuestion(q2, "A");
    expect(ar.newPool).toBe("learned");
    state = await dl.getQuestionState(courseId, qid);
    expect(state?.pool).toBe("learned");
  });

  it("incorrect answer demotes learned→test", async () => {
    db.random = () => 0.01;

    // Get a question into learned pool first
    const q1 = await dl.findNextQuestion(courseId);
    await answerQuestion(q1!, "A");
    const q2state = await dl.getQuestionState(courseId, q1!.state.question_id);
    await answerQuestion(
      { question: q1!.question, state: q2state!, strategy: "oldest" },
      "A",
    );

    // Now it's in learned. Answer wrong.
    const learnedState = await dl.getQuestionState(
      courseId,
      q1!.state.question_id,
    );
    expect(learnedState?.pool).toBe("learned");

    const ar = await answerQuestion(
      { question: q1!.question, state: learnedState!, strategy: "oldest" },
      "B",
    );
    expect(ar.newPool).toBe("test");
  });

  it("config changes affect promotion threshold", async () => {
    await dl.updateConfig({ promotion_consecutive_correct: 3 });
    db.random = () => 0.01;

    const q = await dl.findNextQuestion(courseId);
    const qid = q!.state.question_id;

    // Answer correctly twice — should NOT promote with threshold=3
    await answerQuestion(q!, "A");
    let s = await dl.getQuestionState(courseId, qid);
    await answerQuestion(
      { question: q!.question, state: s!, strategy: "oldest" },
      "A",
    );
    s = await dl.getQuestionState(courseId, qid);
    expect(s?.pool).toBe("test");
    expect(s?.consecutive_correct).toBe(2);

    // Third correct → promotes
    await answerQuestion(
      { question: q!.question, state: s!, strategy: "oldest" },
      "A",
    );
    s = await dl.getQuestionState(courseId, qid);
    expect(s?.pool).toBe("learned");
  });

  describe("Test Pool Size Invariance", () => {
    it("test pool stays at target size when latent has questions", async () => {
      // Upload 10 questions, target size 5
      // After refill, test=5 latent=5
      const stats0 = await dl.getCourseStats(courseId);
      expect(stats0.test_count).toBe(0);

      // Trigger refill via findNextQuestion
      await dl.findNextQuestion(courseId);
      const stats1 = await dl.getCourseStats(courseId);
      expect(stats1.test_count).toBe(5);
      expect(stats1.latent_count).toBe(5);

      // Promote one question out of test → learned
      // This should trigger a refill from latent
      db.random = () => 0.01;
      await dl.updateConfig({
        promotion_consecutive_correct: 1,
        snooze_test_correct_minutes: 0,
      });

      const q = await dl.findNextQuestion(courseId);
      expect(q).not.toBeNull();
      const ar = await answerQuestion(q!, "A");
      expect(ar.newPool).toBe("learned");

      // After promotion, refill should have fired (findNextQuestion calls it)
      // Check by calling findNextQuestion again which triggers refill
      await dl.findNextQuestion(courseId);
      const stats2 = await dl.getCourseStats(courseId);
      expect(stats2.test_count).toBe(5); // refilled from latent
      expect(stats2.latent_count).toBe(4);
      expect(stats2.learned_count).toBe(1);
    });

    it("test pool below target only when latent is empty", async () => {
      // 10 questions, target=5. Promote all out of test.
      await dl.updateConfig({
        promotion_consecutive_correct: 1,
        snooze_test_correct_minutes: 0,
        snooze_learned_correct_hours: 0,
      });
      db.random = () => 0.01;

      // Keep promoting until latent is exhausted
      for (let i = 0; i < 10; i++) {
        const q = await dl.findNextQuestion(courseId);
        if (!q) break;
        await answerQuestion(q, "A");
      }

      const stats = await dl.getCourseStats(courseId);
      expect(stats.latent_count).toBe(0);
      expect(stats.test_count).toBe(0);
      expect(stats.learned_count).toBe(10);
    });

    it("test pool equals upload size when upload < target", async () => {
      // Create course with 3 questions but target size is 5
      const small = COURSE_JSON.slice(0, 3);
      const { course_id } = await dl.createCourse("Small Inv", small);

      await dl.findNextQuestion(course_id);
      const stats = await dl.getCourseStats(course_id);
      expect(stats.test_count).toBe(3);
      expect(stats.latent_count).toBe(0);
    });
  });

  describe("Snooze Safety Guarantee", () => {
    it("snoozed question is never returned by findNextQuestion", async () => {
      // Use 1 question so we can track it precisely
      const singleQ = COURSE_JSON.slice(0, 1);
      const { course_id } = await dl.createCourse("Snooze Test", singleQ);
      await dl.updateConfig({
        test_pool_target_size: 1,
        snooze_test_correct_minutes: 60, // 1 hour snooze
      });
      db.random = () => 0.01;

      const q = await dl.findNextQuestion(course_id);
      expect(q).not.toBeNull();

      // Answer it — it gets snoozed for 60 min
      await answerQuestion(q!, "A", course_id);

      // Now findNextQuestion should return null (only question is snoozed)
      const next = await dl.findNextQuestion(course_id);
      expect(next).toBeNull();
    });

    it("snooze holds across pool transitions", async () => {
      // Promote test→learned with snooze, then check it's still snoozed
      const singleQ = COURSE_JSON.slice(0, 1);
      const { course_id } = await dl.createCourse("Snooze Trans", singleQ);
      await dl.updateConfig({
        test_pool_target_size: 1,
        promotion_consecutive_correct: 1,
        snooze_test_correct_minutes: 60,
      });
      db.random = () => 0.01;

      const q = await dl.findNextQuestion(course_id);
      expect(q).not.toBeNull();

      // Correct answer promotes test→learned, also snoozes for 60 min
      const ar = await answerQuestion(q!, "A", course_id);
      expect(ar.newPool).toBe("learned");

      // Question is now in learned pool but snoozed — should not appear
      const next = await dl.findNextQuestion(course_id);
      expect(next).toBeNull();
    });

    it("snooze holds after demotion", async () => {
      // Get question to learned, then demote with snooze
      const singleQ = COURSE_JSON.slice(0, 1);
      const { course_id } = await dl.createCourse("Snooze Demote", singleQ);
      await dl.updateConfig({
        test_pool_target_size: 1,
        promotion_consecutive_correct: 1,
        snooze_test_correct_minutes: 0,
        snooze_learned_correct_hours: 0,
        snooze_incorrect_minutes: 60, // snooze on wrong answer
      });
      db.random = () => 0.01;

      // Promote to learned
      const q1 = await dl.findNextQuestion(course_id);
      await answerQuestion(q1!, "A", course_id);

      // Now in learned, answer wrong → demotes to test, snoozed 60 min
      const s = await dl.getQuestionState(course_id, q1!.state.question_id);
      const q2: NextQuestionResult = {
        question: q1!.question,
        state: s!,
        strategy: "oldest",
      };
      const ar = await answerQuestion(q2, "B", course_id);
      expect(ar.newPool).toBe("test");

      // Snoozed — should not appear
      const next = await dl.findNextQuestion(course_id);
      expect(next).toBeNull();
    });
  });

  describe("Promotion and Demotion Extremes", () => {
    it("all questions promote to master then demote back to test", async () => {
      const NUM = 5;
      // Fresh isolated environment
      const freshDb = new InMemoryDatabase();
      const freshDl = new DataLayer(freshDb);
      await freshDl.initialize();
      await freshDl.updateConfig({
        test_pool_target_size: NUM,
        promotion_consecutive_correct: 1,
        demotion_incorrect_count: 1,
        snooze_test_correct_minutes: 0,
        snooze_learned_correct_hours: 0,
        snooze_master_correct_days: 0,
        snooze_incorrect_minutes: 0,
      });
      freshDb.random = () => 0.01;
      const { course_id: cid } = await freshDl.createCourse(
        "Extremes",
        COURSE_JSON.slice(0, NUM),
      );

      async function answerQ(pool: string, ans: string) {
        const allQs = await freshDl.getAllQuestions(cid, pool as Pool);
        const avail = allQs.filter(
          (s) =>
            !s.hidden &&
            (s.snooze_until === null || s.snooze_until <= Date.now()),
        );
        expect(avail.length).toBeGreaterThan(0);
        const s = avail[0];
        const question = await freshDl.getQuestion(cid, s.question_id);
        const config = await freshDl.getConfig();
        const ar = processAnswerPure(
          { question: question!, state: s, strategy: "oldest" },
          ans,
          config,
          Date.now(),
        );
        for (const event of ar.events) {
          await freshDl.logEvent(cid, event.type, event.details);
        }
        await freshDl.updateQuestionStateWithPoolTransition(
          cid,
          s.question_id,
          ar.stateUpdates,
          ar.oldPool,
          ar.newPool,
        );
        return ar;
      }

      // Phase 1: test → learned
      for (let i = 0; i < NUM; i++) {
        // Trigger refill first
        await freshDl.refillTestPoolFromLatent(cid);
        const ar = await answerQ("test", "A");
        expect(ar.newPool).toBe("learned");
      }
      let stats = await freshDl.getCourseStats(cid);
      expect(stats.learned_count).toBe(NUM);

      // Phase 2: learned → master
      for (let i = 0; i < NUM; i++) {
        const ar = await answerQ("learned", "A");
        expect(ar.newPool).toBe("master");
      }
      stats = await freshDl.getCourseStats(cid);
      expect(stats.master_count).toBe(NUM);

      // Phase 3: master → learned
      for (let i = 0; i < NUM; i++) {
        const ar = await answerQ("master", "B");
        expect(ar.newPool).toBe("learned");
      }
      stats = await freshDl.getCourseStats(cid);
      expect(stats.learned_count).toBe(NUM);
      expect(stats.master_count).toBe(0);

      // Phase 4: learned → test
      for (let i = 0; i < NUM; i++) {
        const ar = await answerQ("learned", "B");
        expect(ar.newPool).toBe("test");
      }
      stats = await freshDl.getCourseStats(cid);
      expect(stats.test_count).toBe(NUM);
      expect(stats.learned_count).toBe(0);
      expect(stats.master_count).toBe(0);
    });
  });

  it("full session: answer all questions correctly through to master", async () => {
    await dl.updateConfig({
      test_pool_target_size: 3,
      promotion_consecutive_correct: 1, // promote on first correct
    });

    // Re-create with 3 questions for a quick run
    db = new InMemoryDatabase();
    dl = new DataLayer(db);
    await dl.initialize();
    await dl.updateConfig({
      test_pool_target_size: 3,
      promotion_consecutive_correct: 1,
      snooze_test_correct_minutes: 0,
      snooze_learned_correct_hours: 0,
      snooze_master_correct_days: 0,
      snooze_incorrect_minutes: 0,
    });
    const small = COURSE_JSON.slice(0, 3);
    const { course_id } = await dl.createCourse("Small", small);
    courseId = course_id;

    db.random = () => 0.01;

    // Round 1: all from test → learned
    for (let i = 0; i < 3; i++) {
      const q = await dl.findNextQuestion(courseId);
      if (!q) break;
      await answerQuestion(q, "A");
    }
    let stats = await dl.getCourseStats(courseId);
    expect(stats.learned_count).toBe(3);
    expect(stats.test_count).toBe(0);

    // Round 2: all from learned → master
    for (let i = 0; i < 3; i++) {
      const q = await dl.findNextQuestion(courseId);
      if (!q) break;
      await answerQuestion(q, "A");
    }
    stats = await dl.getCourseStats(courseId);
    expect(stats.master_count).toBe(3);
  });
});
