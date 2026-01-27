/**
 * Data Layer - Core implementation
 * Environment-agnostic data layer for spaced repetition flashcard system
 * Does not depend on IndexedDB; uses an interface for database operations
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type Pool = "latent" | "test" | "learned" | "master";
export type SelectionStrategy = "oldest" | "recovery" | "random";
export type EventType =
  | "course_created"
  | "course_reset"
  | "latent_promotion"
  | "promotion"
  | "demotion"
  | "question_hidden"
  | "session_started"
  | "session_ended"
  | "user_interaction";

export interface OriginalQuestion {
  course_id: string;
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export interface QuestionState {
  course_id: string;
  question_id: number;
  pool: Pool;
  last_shown: number | null;
  snooze_until: number | null;
  hidden: boolean;
  notes: string;
  consecutive_correct: number;
  total_interactions: number;
}

export interface Interaction {
  id?: number;
  course_id: string;
  question_id: number;
  timestamp: number;
  answer_given: string;
  correct: boolean;
  snooze_duration: number;
  selection_strategy: SelectionStrategy;
  pool_at_time: Pool;
}

export interface LogEntry {
  id?: number;
  course_id: string;
  timestamp: number;
  type: EventType;
  details: Record<string, unknown>;
}

export interface CourseMetadata {
  id: string;
  name: string;
  created_at: number;
  last_accessed: number;
}

export interface CourseStats {
  id: string;
  question_count: number;
  latent_count: number;
  test_count: number;
  learned_count: number;
  master_count: number;
}

export interface Configuration {
  id: string;
  test_pool_target_size: number;
  latent_promotion_threshold: number;
  snooze_incorrect_minutes: number;
  snooze_test_correct_minutes: number;
  snooze_learned_correct_hours: number;
  snooze_master_correct_days: number;
  pool_selection_test_upper: number;
  pool_selection_learned_upper: number;
  strategy_oldest_upper: number;
  strategy_recovery_upper: number;
  promotion_consecutive_correct: number;
  demotion_incorrect_count: number;
}

export interface ValidationError {
  index: number;
  reason: string;
}

export interface CourseCreationResult {
  course_id: string;
  total_loaded: number;
  total_skipped: number;
  validation_errors: ValidationError[];
}

export interface NextQuestionResult {
  question: OriginalQuestion;
  state: QuestionState;
  strategy: SelectionStrategy;
}

// ============================================================================
// Database Interface
// ============================================================================

export interface IDatabase {
  // Initialization
  initDatabase(): Promise<void>;
  isInitialized(): Promise<boolean>;

  // Course Operations
  createCourse(
    name: string,
    questionsJson: unknown,
  ): Promise<CourseCreationResult>;
  listCourses(): Promise<(CourseMetadata & CourseStats)[]>;
  deleteCourse(courseId: string): Promise<void>;
  resetCourse(courseId: string): Promise<void>;
  getCourseStats(courseId: string): Promise<CourseStats>;

  // Question Operations
  getQuestion(
    courseId: string,
    questionId: number,
  ): Promise<OriginalQuestion | undefined>;
  getQuestionState(
    courseId: string,
    questionId: number,
  ): Promise<QuestionState | undefined>;
  updateQuestionState(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
  ): Promise<void>;
  hideQuestion(courseId: string, questionId: number): Promise<void>;
  updateNotes(
    courseId: string,
    questionId: number,
    notes: string,
  ): Promise<void>;

  // Interaction Operations
  recordInteraction(
    courseId: string,
    questionId: number,
    answer: string,
    correct: boolean,
    strategy: SelectionStrategy,
    pool: Pool,
    snooze_duration: number,
  ): Promise<void>;
  getQuestionHistory(
    courseId: string,
    questionId: number,
  ): Promise<Interaction[]>;

  // Selection Operations
  findNextQuestion(courseId: string): Promise<NextQuestionResult | null>;
  getAvailableQuestions(courseId: string, pool: Pool): Promise<QuestionState[]>;
  getAllQuestions(courseId: string, pool: Pool): Promise<QuestionState[]>;

  // Logging Operations
  logEvent(
    courseId: string,
    type: EventType,
    details: Record<string, unknown>,
  ): Promise<void>;
  getEventLog(
    courseId: string,
    limit?: number,
    offset?: number,
  ): Promise<LogEntry[]>;

  // Configuration Operations
  getConfig(): Promise<Configuration>;
  updateConfig(updates: Partial<Configuration>): Promise<void>;
}

// ============================================================================
// Data Layer Service
// ============================================================================

export class DataLayer {
  private db: IDatabase;

  constructor(database: IDatabase) {
    this.db = database;
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<void> {
    await this.db.initDatabase();
  }

  async isReady(): Promise<boolean> {
    return this.db.isInitialized();
  }

  // ========================================================================
  // Course Management
  // ========================================================================

  async createCourse(
    name: string,
    questionsJson: unknown,
  ): Promise<CourseCreationResult> {
    return this.db.createCourse(name, questionsJson);
  }

  async listCourses(): Promise<(CourseMetadata & CourseStats)[]> {
    return this.db.listCourses();
  }

  async deleteCourse(courseId: string): Promise<void> {
    return this.db.deleteCourse(courseId);
  }

  async resetCourse(courseId: string): Promise<void> {
    return this.db.resetCourse(courseId);
  }

  async getCourseStats(courseId: string): Promise<CourseStats> {
    return this.db.getCourseStats(courseId);
  }

  // ========================================================================
  // Question Management
  // ========================================================================

  async getQuestion(
    courseId: string,
    questionId: number,
  ): Promise<OriginalQuestion | undefined> {
    return this.db.getQuestion(courseId, questionId);
  }

  async getQuestionState(
    courseId: string,
    questionId: number,
  ): Promise<QuestionState | undefined> {
    return this.db.getQuestionState(courseId, questionId);
  }

  async updateQuestionState(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
  ): Promise<void> {
    return this.db.updateQuestionState(courseId, questionId, updates);
  }

  async hideQuestion(courseId: string, questionId: number): Promise<void> {
    return this.db.hideQuestion(courseId, questionId);
  }

  async updateNotes(
    courseId: string,
    questionId: number,
    notes: string,
  ): Promise<void> {
    return this.db.updateNotes(courseId, questionId, notes);
  }

  // ========================================================================
  // Interaction Management
  // ========================================================================

  async recordInteraction(
    courseId: string,
    questionId: number,
    answer: string,
    correct: boolean,
    strategy: SelectionStrategy,
    pool: Pool,
    snooze_duration: number,
  ): Promise<void> {
    return this.db.recordInteraction(
      courseId,
      questionId,
      answer,
      correct,
      strategy,
      pool,
      snooze_duration,
    );
  }

  async getQuestionHistory(
    courseId: string,
    questionId: number,
  ): Promise<Interaction[]> {
    return this.db.getQuestionHistory(courseId, questionId);
  }

  // ========================================================================
  // Question Selection Algorithm
  // ========================================================================

  async findNextQuestion(courseId: string): Promise<NextQuestionResult | null> {
    return this.db.findNextQuestion(courseId);
  }

  async getAvailableQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    return this.db.getAvailableQuestions(courseId, pool);
  }

  async getAllQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    return this.db.getAllQuestions(courseId, pool);
  }

  // ========================================================================
  // Logging
  // ========================================================================

  async logEvent(
    courseId: string,
    type: EventType,
    details: Record<string, unknown>,
  ): Promise<void> {
    return this.db.logEvent(courseId, type, details);
  }

  async getEventLog(
    courseId: string,
    limit?: number,
    offset?: number,
  ): Promise<LogEntry[]> {
    return this.db.getEventLog(courseId, limit, offset);
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  async getConfig(): Promise<Configuration> {
    return this.db.getConfig();
  }

  async updateConfig(updates: Partial<Configuration>): Promise<void> {
    return this.db.updateConfig(updates);
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Validates a question object against the schema
   */
  static validateQuestion(question: unknown): {
    valid: boolean;
    error?: string;
  } {
    if (typeof question !== "object" || question === null) {
      return { valid: false, error: "Question must be an object" };
    }

    const q = question as Record<string, unknown>;

    // Check required fields
    if (typeof q.question !== "string" || q.question.trim() === "") {
      return { valid: false, error: "Missing or invalid 'question' field" };
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      return {
        valid: false,
        error: "Options must be an array with at least 2 items",
      };
    }

    if (typeof q.correct_option !== "string") {
      return {
        valid: false,
        error: "Missing or invalid 'correct_option' field",
      };
    }

    if (typeof q.explanation !== "string") {
      return { valid: false, error: "Missing or invalid 'explanation' field" };
    }

    // Verify correct_option is in options
    if (!q.options.includes(q.correct_option)) {
      return {
        valid: false,
        error: "correct_option must match one of the options exactly",
      };
    }

    return { valid: true };
  }

  /**
   * Parses and validates JSON questions array
   */
  static parseQuestionsJson(json: unknown): {
    questions: Record<string, unknown>[];
    errors: ValidationError[];
  } {
    const questions: Record<string, unknown>[] = [];
    const errors: ValidationError[] = [];

    if (!Array.isArray(json)) {
      return {
        questions: [],
        errors: [{ index: 0, reason: "Input must be an array" }],
      };
    }

    json.forEach((item, index) => {
      const validation = DataLayer.validateQuestion(item);
      if (validation.valid) {
        questions.push(item as Record<string, unknown>);
      } else {
        errors.push({
          index,
          reason: validation.error || "Unknown validation error",
        });
      }
    });

    return { questions, errors };
  }

  /**
   * Converts hours to minutes
   */
  static hoursToMinutes(hours: number): number {
    return hours * 60;
  }

  /**
   * Converts days to minutes
   */
  static daysToMinutes(days: number): number {
    return days * 24 * 60;
  }

  /**
   * Calculates snooze expiration timestamp
   */
  static calculateSnoozeUntil(
    currentTime: number,
    durationMinutes: number,
  ): number {
    return currentTime + durationMinutes * 60 * 1000;
  }

  /**
   * Checks if a question is currently snoozed
   */
  static isQuestionSnoozed(state: QuestionState, currentTime: number): boolean {
    if (state.snooze_until === null) return false;
    return currentTime < state.snooze_until;
  }
}

export default DataLayer;
