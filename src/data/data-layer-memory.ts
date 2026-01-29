/**
 * In-Memory implementation of IDatabase for testing.
 * No browser APIs required — runs in Node/Bun.
 */

import type {
  IDatabase,
  OriginalQuestion,
  QuestionState,
  Interaction,
  LogEntry,
  CourseMetadata,
  CourseStats,
  Configuration,
  Pool,
  SelectionStrategy,
  EventType,
  CourseCreationResult,
  NextQuestionResult,
} from "./data-layer.ts";
import { DataLayer } from "./data-layer.ts";

const DEFAULT_CONFIG: Configuration = {
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
};

export class InMemoryDatabase implements IDatabase {
  private initialized = false;
  private courseMetadata: Map<string, CourseMetadata> = new Map();
  private courseStats: Map<string, CourseStats> = new Map();
  private questions: Map<string, OriginalQuestion> = new Map(); // key: "courseId:questionId"
  private questionStates: Map<string, QuestionState> = new Map();
  private interactions: Interaction[] = [];
  private logs: LogEntry[] = [];
  private config: Configuration = { ...DEFAULT_CONFIG };
  private nextInteractionId = 1;
  private nextLogId = 1;
  private uuidCounter = 0;

  /** Allow injecting a custom random function for deterministic tests */
  random: () => number = Math.random;

  private key(courseId: string, questionId: number): string {
    return `${courseId}:${questionId}`;
  }

  async initDatabase(): Promise<void> {
    this.initialized = true;
  }

  async isInitialized(): Promise<boolean> {
    return this.initialized;
  }

  async createCourse(
    name: string,
    questionsJson: unknown,
  ): Promise<CourseCreationResult> {
    // Check duplicate name
    for (const m of this.courseMetadata.values()) {
      if (m.name === name) {
        throw new Error("A course with this name already exists.");
      }
    }

    const courseId = `test-${++this.uuidCounter}`;
    const now = Date.now();
    const { questions, errors } = DataLayer.parseQuestionsJson(questionsJson);

    this.courseMetadata.set(courseId, {
      id: courseId,
      name,
      created_at: now,
      last_accessed: now,
    });

    this.courseStats.set(courseId, {
      id: courseId,
      question_count: questions.length,
      latent_count: questions.length,
      test_count: 0,
      learned_count: 0,
      master_count: 0,
    });

    questions.forEach((q, index) => {
      const qid = index + 1;
      const k = this.key(courseId, qid);
      this.questions.set(k, {
        course_id: courseId,
        id: qid,
        question: String(q.question),
        options: Array.isArray(q.options)
          ? q.options.map(String)
          : [String(q.options)],
        correct_option: String(q.correct_option),
        explanation: String(q.explanation),
      });
      this.questionStates.set(k, {
        course_id: courseId,
        question_id: qid,
        pool: "latent",
        last_shown: null,
        snooze_until: null,
        hidden: false,
        notes: "",
        consecutive_correct: 0,
        consecutive_incorrect: 0,
        total_interactions: 0,
        was_demoted: false,
      });
    });

    this.logs.push({
      id: this.nextLogId++,
      course_id: courseId,
      timestamp: now,
      type: "course_created",
      details: {
        name,
        total_questions: questions.length,
        skipped_questions: errors.length,
      },
    });

    return {
      course_id: courseId,
      total_loaded: questions.length,
      total_skipped: errors.length,
      validation_errors: errors,
    };
  }

  async listCourses(): Promise<(CourseMetadata & CourseStats)[]> {
    const result: (CourseMetadata & CourseStats)[] = [];
    for (const m of this.courseMetadata.values()) {
      const s = this.courseStats.get(m.id);
      result.push({
        ...m,
        ...(s || {
          question_count: 0,
          latent_count: 0,
          test_count: 0,
          learned_count: 0,
          master_count: 0,
        }),
      });
    }
    return result;
  }

  async deleteCourse(courseId: string): Promise<void> {
    this.courseMetadata.delete(courseId);
    this.courseStats.delete(courseId);
    for (const [k, q] of this.questions) {
      if (q.course_id === courseId) this.questions.delete(k);
    }
    for (const [k, s] of this.questionStates) {
      if (s.course_id === courseId) this.questionStates.delete(k);
    }
    this.interactions = this.interactions.filter(
      (i) => i.course_id !== courseId,
    );
    this.logs = this.logs.filter((l) => l.course_id !== courseId);
  }

  async resetCourse(courseId: string): Promise<void> {
    const now = Date.now();
    const stats = this.courseStats.get(courseId);
    if (!stats) return;

    for (const [, s] of this.questionStates) {
      if (s.course_id === courseId) {
        s.pool = "latent";
        s.last_shown = null;
        s.snooze_until = null;
        s.hidden = false;
        s.notes = "";
        s.consecutive_correct = 0;
        s.consecutive_incorrect = 0;
        s.total_interactions = 0;
        s.was_demoted = false;
      }
    }

    this.interactions = this.interactions.filter(
      (i) => i.course_id !== courseId,
    );
    this.logs = this.logs.filter((l) => l.course_id !== courseId);

    this.courseStats.set(courseId, {
      ...stats,
      latent_count: stats.question_count,
      test_count: 0,
      learned_count: 0,
      master_count: 0,
    });

    this.logs.push({
      id: this.nextLogId++,
      course_id: courseId,
      timestamp: now,
      type: "course_reset",
      details: { reset_at: now },
    });
  }

  async getCourseStats(courseId: string): Promise<CourseStats> {
    const s = this.courseStats.get(courseId);
    if (!s) throw new Error(`Course ${courseId} not found`);
    return { ...s };
  }

  async getQuestion(
    courseId: string,
    questionId: number,
  ): Promise<OriginalQuestion | undefined> {
    return this.questions.get(this.key(courseId, questionId));
  }

  async getQuestionState(
    courseId: string,
    questionId: number,
  ): Promise<QuestionState | undefined> {
    const s = this.questionStates.get(this.key(courseId, questionId));
    return s ? { ...s } : undefined;
  }

  async updateQuestionState(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
  ): Promise<void> {
    const k = this.key(courseId, questionId);
    const s = this.questionStates.get(k);
    if (s) {
      this.questionStates.set(k, { ...s, ...updates });
    }
  }

  async updateQuestionStateWithPoolTransition(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
    oldPool: Pool,
    newPool: Pool,
  ): Promise<void> {
    const k = this.key(courseId, questionId);
    const s = this.questionStates.get(k);
    if (s) {
      this.questionStates.set(k, { ...s, ...updates });
    }
    if (oldPool !== newPool) {
      const stats = this.courseStats.get(courseId);
      if (stats) {
        const oldKey = `${oldPool}_count` as keyof CourseStats;
        const newKey = `${newPool}_count` as keyof CourseStats;
        this.courseStats.set(courseId, {
          ...stats,
          [oldKey]: (stats[oldKey] as number) - 1,
          [newKey]: (stats[newKey] as number) + 1,
        });
      }
    }
  }

  async hideQuestion(courseId: string, questionId: number): Promise<void> {
    const k = this.key(courseId, questionId);
    const s = this.questionStates.get(k);
    if (!s) return;

    const wasTestPool = s.pool === "test";
    this.questionStates.set(k, { ...s, hidden: true });

    const stats = this.courseStats.get(courseId);
    if (stats) {
      const poolKey = `${s.pool}_count` as keyof CourseStats;
      this.courseStats.set(courseId, {
        ...stats,
        [poolKey]: (stats[poolKey] as number) - 1,
        question_count: stats.question_count - 1,
      });
    }

    this.logs.push({
      id: this.nextLogId++,
      course_id: courseId,
      timestamp: Date.now(),
      type: "question_hidden",
      details: { question_id: questionId },
    });

    if (wasTestPool) {
      await this.refillTestPoolFromLatent(courseId);
    }
  }

  async updateNotes(
    courseId: string,
    questionId: number,
    notes: string,
  ): Promise<void> {
    await this.updateQuestionState(courseId, questionId, { notes });
  }

  async recordInteraction(
    courseId: string,
    questionId: number,
    answer: string,
    correct: boolean,
    strategy: SelectionStrategy,
    pool: Pool,
    snooze_duration: number,
  ): Promise<void> {
    this.interactions.push({
      id: this.nextInteractionId++,
      course_id: courseId,
      question_id: questionId,
      timestamp: Date.now(),
      answer_given: answer,
      correct,
      snooze_duration,
      selection_strategy: strategy,
      pool_at_time: pool,
    });
  }

  async getQuestionHistory(
    courseId: string,
    questionId: number,
  ): Promise<Interaction[]> {
    return this.interactions.filter(
      (i) => i.course_id === courseId && i.question_id === questionId,
    );
  }

  async findNextQuestion(courseId: string): Promise<NextQuestionResult | null> {
    const config = this.config;
    await this.refillTestPoolFromLatent(courseId);

    const pools: Pool[] = ["test", "learned", "master"];
    const baseWeights: Record<string, number> = {
      test: config.pool_weight_test,
      learned: config.pool_weight_learned,
      master: config.pool_weight_master,
    };
    const threshold = config.pool_penalty_threshold;

    const poolData: {
      pool: Pool;
      available: QuestionState[];
      weight: number;
    }[] = [];
    for (const pool of pools) {
      const avail = await this.getAvailableQuestions(courseId, pool);
      if (avail.length === 0) continue;
      const penalty = avail.length >= threshold ? 1 : avail.length / threshold;
      poolData.push({
        pool,
        available: avail,
        weight: baseWeights[pool] * penalty,
      });
    }
    if (poolData.length === 0) return null;

    const totalWeight = poolData.reduce((sum, p) => sum + p.weight, 0);
    const rand = this.random() * totalWeight;
    let cumulative = 0;
    let chosen = poolData[0];
    for (const entry of poolData) {
      cumulative += entry.weight;
      if (rand < cumulative) {
        chosen = entry;
        break;
      }
    }
    const available = chosen.available;

    const strategyRand = this.random() * 100;
    let strategy: SelectionStrategy;
    let selected: QuestionState | null = null;

    if (strategyRand < config.strategy_oldest_pct) {
      strategy = "oldest";
      selected = available.reduce((prev, curr) =>
        (prev.last_shown ?? Infinity) < (curr.last_shown ?? Infinity)
          ? prev
          : curr,
      );
    } else if (
      strategyRand <
      config.strategy_oldest_pct + config.strategy_demoted_pct
    ) {
      strategy = "recovery";
      const demoted = available.filter((s) => s.was_demoted);
      if (demoted.length > 0) {
        selected = demoted.reduce((prev, curr) =>
          (prev.last_shown ?? Infinity) < (curr.last_shown ?? Infinity)
            ? prev
            : curr,
        );
      } else {
        strategy = "random";
      }
    } else {
      strategy = "random";
    }
    if (strategy === "random" || !selected) {
      selected = available[Math.floor(this.random() * available.length)];
    }

    const question = await this.getQuestion(courseId, selected.question_id);
    if (!question) return null;
    return { question, state: selected, strategy };
  }

  async getAvailableQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    const now = Date.now();
    const result: QuestionState[] = [];
    for (const s of this.questionStates.values()) {
      if (
        s.course_id === courseId &&
        s.pool === pool &&
        !s.hidden &&
        (s.snooze_until === null || s.snooze_until <= now)
      ) {
        result.push({ ...s });
      }
    }
    return result;
  }

  async getAllQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    const result: QuestionState[] = [];
    for (const s of this.questionStates.values()) {
      if (s.course_id === courseId && s.pool === pool) {
        result.push({ ...s });
      }
    }
    return result;
  }

  async updateCourseStats(
    courseId: string,
    updates: Partial<CourseStats>,
  ): Promise<void> {
    const s = this.courseStats.get(courseId);
    if (s) {
      this.courseStats.set(courseId, { ...s, ...updates });
    }
  }

  async updateLastAccessed(courseId: string): Promise<void> {
    const m = this.courseMetadata.get(courseId);
    if (m) {
      this.courseMetadata.set(courseId, { ...m, last_accessed: Date.now() });
    }
  }

  async logEvent(
    courseId: string,
    type: EventType,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.logs.push({
      id: this.nextLogId++,
      course_id: courseId,
      timestamp: Date.now(),
      type,
      details,
    });
  }

  async getEventLog(
    courseId: string,
    limit = 100,
    offset = 0,
  ): Promise<LogEntry[]> {
    const filtered = this.logs
      .filter((l) => l.course_id === courseId)
      .sort((a, b) => b.timestamp - a.timestamp);
    return filtered.slice(offset, offset + limit);
  }

  async getConfig(): Promise<Configuration> {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<Configuration>): Promise<void> {
    this.config = { ...this.config, ...updates };
  }

  async loadExternalConfig(): Promise<void> {
    // No-op in memory implementation
  }

  async refillTestPoolFromLatent(courseId: string): Promise<number> {
    const config = this.config;
    const testQuestions = await this.getAllQuestions(courseId, "test");
    const actualTestCount = testQuestions.filter((q) => !q.hidden).length;

    if (actualTestCount >= config.test_pool_target_size) return 0;

    const latentAll = await this.getAllQuestions(courseId, "latent");
    const latentAvailable = latentAll.filter((s) => !s.hidden);
    if (latentAvailable.length === 0) return 0;

    latentAvailable.sort((a, b) => a.question_id - b.question_id);
    const toPromote = Math.min(
      latentAvailable.length,
      config.test_pool_target_size - actualTestCount,
    );
    if (toPromote === 0) return 0;

    const stats = this.courseStats.get(courseId);
    for (let i = 0; i < toPromote; i++) {
      const q = latentAvailable[i];
      const k = this.key(courseId, q.question_id);
      const s = this.questionStates.get(k);
      if (s) {
        this.questionStates.set(k, { ...s, pool: "test" });
      }
    }

    if (stats) {
      this.courseStats.set(courseId, {
        ...stats,
        latent_count: stats.latent_count - toPromote,
        test_count: stats.test_count + toPromote,
      });
    }

    const timestamp = Date.now();
    for (let i = 0; i < toPromote; i++) {
      this.logs.push({
        id: this.nextLogId++,
        course_id: courseId,
        timestamp,
        type: "promotion",
        details: {
          question_id: latentAvailable[i].question_id,
          source: "latent",
          target: "test",
          reason: "test_pool_refill",
        },
      });
    }

    return toPromote;
  }
}
