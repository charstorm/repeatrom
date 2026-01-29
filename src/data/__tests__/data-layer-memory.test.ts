import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryDatabase } from "../data-layer-memory.ts";
import { DataLayer } from "../data-layer.ts";

const SAMPLE_QUESTIONS = [
  {
    question: "Q1",
    options: ["A", "B", "C"],
    correct_option: "A",
    explanation: "E1",
  },
  {
    question: "Q2",
    options: ["X", "Y", "Z"],
    correct_option: "Y",
    explanation: "E2",
  },
  {
    question: "Q3",
    options: ["1", "2", "3"],
    correct_option: "2",
    explanation: "E3",
  },
];

describe("InMemoryDatabase", () => {
  let db: InMemoryDatabase;
  let dl: DataLayer;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    dl = new DataLayer(db);
    await dl.initialize();
  });

  describe("course creation", () => {
    it("creates a course and returns stats", async () => {
      const result = await dl.createCourse("Test Course", SAMPLE_QUESTIONS);
      expect(result.total_loaded).toBe(3);
      expect(result.total_skipped).toBe(0);

      const courses = await dl.listCourses();
      expect(courses).toHaveLength(1);
      expect(courses[0].name).toBe("Test Course");
      expect(courses[0].question_count).toBe(3);
      expect(courses[0].latent_count).toBe(3);
    });

    it("rejects duplicate course names", async () => {
      await dl.createCourse("Test", SAMPLE_QUESTIONS);
      await expect(dl.createCourse("Test", SAMPLE_QUESTIONS)).rejects.toThrow(
        "already exists",
      );
    });

    it("skips invalid questions", async () => {
      const mixed = [
        ...SAMPLE_QUESTIONS,
        {
          question: "",
          options: ["A"],
          correct_option: "A",
          explanation: "bad",
        },
      ];
      const result = await dl.createCourse("Mixed", mixed);
      expect(result.total_loaded).toBe(3);
      expect(result.total_skipped).toBe(1);
    });
  });

  describe("question state", () => {
    it("all questions start in latent pool", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      const states = await dl.getAllQuestions(course_id, "latent");
      expect(states).toHaveLength(3);
    });

    it("updates question state", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.updateQuestionState(course_id, 1, { consecutive_correct: 5 });
      const s = await dl.getQuestionState(course_id, 1);
      expect(s?.consecutive_correct).toBe(5);
    });
  });

  describe("pool transitions", () => {
    it("updates stats on pool transition", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.updateQuestionStateWithPoolTransition(
        course_id,
        1,
        { pool: "test" },
        "latent",
        "test",
      );
      const stats = await dl.getCourseStats(course_id);
      expect(stats.latent_count).toBe(2);
      expect(stats.test_count).toBe(1);
    });
  });

  describe("refillTestPoolFromLatent", () => {
    it("fills test pool up to target size", async () => {
      await dl.updateConfig({ test_pool_target_size: 2 });
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      const promoted = await dl.refillTestPoolFromLatent(course_id);
      expect(promoted).toBe(2);
      const stats = await dl.getCourseStats(course_id);
      expect(stats.test_count).toBe(2);
      expect(stats.latent_count).toBe(1);
    });
  });

  describe("config", () => {
    it("returns default config", async () => {
      const config = await dl.getConfig();
      expect(config.promotion_consecutive_correct).toBe(2);
    });

    it("updates config", async () => {
      await dl.updateConfig({ promotion_consecutive_correct: 5 });
      const config = await dl.getConfig();
      expect(config.promotion_consecutive_correct).toBe(5);
    });
  });

  describe("course reset", () => {
    it("resets all questions to latent", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.updateQuestionStateWithPoolTransition(
        course_id,
        1,
        { pool: "test" },
        "latent",
        "test",
      );
      await dl.resetCourse(course_id);
      const stats = await dl.getCourseStats(course_id);
      expect(stats.latent_count).toBe(3);
      expect(stats.test_count).toBe(0);
    });
  });

  describe("course delete", () => {
    it("removes all course data", async () => {
      await dl.createCourse("C", SAMPLE_QUESTIONS);
      const courses = await dl.listCourses();
      await dl.deleteCourse(courses[0].id);
      expect(await dl.listCourses()).toHaveLength(0);
    });
  });

  describe("interactions", () => {
    it("records and retrieves interactions", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.recordInteraction(course_id, 1, "A", true, "random", "test", 5);
      const history = await dl.getQuestionHistory(course_id, 1);
      expect(history).toHaveLength(1);
      expect(history[0].correct).toBe(true);
    });
  });

  describe("event log", () => {
    it("logs and retrieves events", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.logEvent(course_id, "user_interaction", { test: true });
      const logs = await dl.getEventLog(course_id);
      // course_created + user_interaction
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("hide question", () => {
    it("marks question hidden and adjusts stats", async () => {
      const { course_id } = await dl.createCourse("C", SAMPLE_QUESTIONS);
      await dl.hideQuestion(course_id, 1);
      const s = await dl.getQuestionState(course_id, 1);
      expect(s?.hidden).toBe(true);
      const stats = await dl.getCourseStats(course_id);
      expect(stats.question_count).toBe(2);
    });
  });
});
