/**
 * Data Layer - IndexedDB Implementation
 * Concrete implementation of IDatabase using IndexedDB
 * Works in both browser and Node.js/Bun environments
 */

import {
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ValidationError,
  CourseCreationResult,
  NextQuestionResult,
  DataLayer,
} from "./data-layer";

let FakeIndexedDB: IDBFactory | undefined;
let FakeIDBKeyRange: typeof IDBKeyRange | undefined;

if (typeof globalThis.indexedDB === "undefined") {
  try {
    const { default: fakeIDB, IDBKeyRange: fakeIDBKeyRange } =
      await import("fake-indexeddb");
    FakeIndexedDB = fakeIDB;
    FakeIDBKeyRange = fakeIDBKeyRange;
  } catch {
    // Browser environment, fake-indexeddb not available
  }
}

function getIndexedDB(): IDBFactory {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }

  if (!FakeIndexedDB) {
    throw new Error("IndexedDB not available in this environment");
  }

  return FakeIndexedDB;
}

function getIDBKeyRange(): typeof IDBKeyRange {
  if (typeof globalThis !== "undefined" && globalThis.IDBKeyRange) {
    return globalThis.IDBKeyRange;
  }

  if (!FakeIDBKeyRange) {
    throw new Error("IDBKeyRange not available in this environment");
  }

  return FakeIDBKeyRange;
}
// ============================================================================
// Constants
// ============================================================================

const DB_NAME = "repeatrom_db";
const DB_VERSION = 1;

const STORE_NAMES = {
  COURSE_METADATA: "course_metadata",
  COURSES: "courses",
  ORIGINAL_QUESTIONS: "original_questions",
  QUESTION_STATES: "question_states",
  INTERACTIONS: "interactions",
  LOGS: "logs",
  CONFIGURATION: "configuration",
} as const;

// ============================================================================
// IndexedDB Implementation
// ============================================================================

export class IndexedDBLayer implements IDatabase {
  private db: IDBDatabase | null = null;
  private indexedDB: IDBFactory;

  constructor() {
    this.indexedDB = getIndexedDB();
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createSchema(db);
      };
    });
  }

  async isInitialized(): Promise<boolean> {
    return this.db !== null;
  }

  private createSchema(db: IDBDatabase): void {
    // course_metadata store
    if (!db.objectStoreNames.contains(STORE_NAMES.COURSE_METADATA)) {
      const courseMetadataStore = db.createObjectStore(
        STORE_NAMES.COURSE_METADATA,
        { keyPath: "id" },
      );
      courseMetadataStore.createIndex("name", "name", { unique: true });
    }

    // courses store
    if (!db.objectStoreNames.contains(STORE_NAMES.COURSES)) {
      db.createObjectStore(STORE_NAMES.COURSES, { keyPath: "id" });
    }

    // original_questions store
    if (!db.objectStoreNames.contains(STORE_NAMES.ORIGINAL_QUESTIONS)) {
      const questionsStore = db.createObjectStore(
        STORE_NAMES.ORIGINAL_QUESTIONS,
        { keyPath: ["course_id", "id"] },
      );
      questionsStore.createIndex("course_id", "course_id");
    }

    // question_states store
    if (!db.objectStoreNames.contains(STORE_NAMES.QUESTION_STATES)) {
      const statesStore = db.createObjectStore(STORE_NAMES.QUESTION_STATES, {
        keyPath: ["course_id", "question_id"],
      });
      statesStore.createIndex("course_id_pool", ["course_id", "pool"]);
      statesStore.createIndex("course_id_snooze", [
        "course_id",
        "snooze_until",
      ]);
      statesStore.createIndex("course_id_hidden", ["course_id", "hidden"]);
    }

    // interactions store
    if (!db.objectStoreNames.contains(STORE_NAMES.INTERACTIONS)) {
      const interactionsStore = db.createObjectStore(STORE_NAMES.INTERACTIONS, {
        keyPath: "id",
        autoIncrement: true,
      });
      interactionsStore.createIndex("course_id_question_id_timestamp", [
        "course_id",
        "question_id",
        "timestamp",
      ]);
      interactionsStore.createIndex("course_id_timestamp", [
        "course_id",
        "timestamp",
      ]);
    }

    // logs store
    if (!db.objectStoreNames.contains(STORE_NAMES.LOGS)) {
      const logsStore = db.createObjectStore(STORE_NAMES.LOGS, {
        keyPath: "id",
        autoIncrement: true,
      });
      logsStore.createIndex("course_id_timestamp", ["course_id", "timestamp"]);
    }

    // configuration store
    if (!db.objectStoreNames.contains(STORE_NAMES.CONFIGURATION)) {
      const configStore = db.createObjectStore(STORE_NAMES.CONFIGURATION, {
        keyPath: "id",
      });
      // Initialize default configuration
      configStore.add({
        id: "global",
        test_pool_target_size: 39,
        latent_promotion_threshold: 38,
        snooze_incorrect_minutes: 1,
        snooze_test_correct_minutes: 10,
        snooze_learned_correct_hours: 24,
        snooze_master_correct_days: 7,
        pool_selection_test_upper: 75,
        pool_selection_learned_upper: 95,
        strategy_oldest_upper: 33,
        strategy_recovery_upper: 50,
        promotion_consecutive_correct: 2,
        demotion_incorrect_count: 1,
      });
    }
  }

  // ========================================================================
  // Course Operations
  // ========================================================================

  async createCourse(
    name: string,
    questionsJson: unknown,
  ): Promise<CourseCreationResult> {
    if (!this.db) throw new Error("Database not initialized");

    const courseId = this.generateUUID();
    const now = Date.now();

    // Parse and validate questions
    const { questions, errors } = DataLayer.parseQuestionsJson(questionsJson);

    const transaction = this.db.transaction(
      [
        STORE_NAMES.COURSE_METADATA,
        STORE_NAMES.COURSES,
        STORE_NAMES.ORIGINAL_QUESTIONS,
        STORE_NAMES.QUESTION_STATES,
        STORE_NAMES.LOGS,
      ],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      try {
        // Add course metadata
        const metadataStore = transaction.objectStore(
          STORE_NAMES.COURSE_METADATA,
        );
        metadataStore.add({
          id: courseId,
          name,
          created_at: now,
          last_accessed: now,
        });

        // Add course stats
        const coursesStore = transaction.objectStore(STORE_NAMES.COURSES);
        coursesStore.add({
          id: courseId,
          question_count: questions.length,
          latent_count: questions.length,
          test_count: 0,
          learned_count: 0,
          master_count: 0,
        });

        // Add questions and states
        const questionsStore = transaction.objectStore(
          STORE_NAMES.ORIGINAL_QUESTIONS,
        );
        const statesStore = transaction.objectStore(
          STORE_NAMES.QUESTION_STATES,
        );

        questions.forEach((q, index) => {
          const questionId = index + 1;
          const question: OriginalQuestion = {
            course_id: courseId,
            id: questionId,
            question: String(q.question),
            options: Array.isArray(q.options)
              ? q.options.map(String)
              : [String(q.options)],
            correct_option: String(q.correct_option),
            explanation: String(q.explanation),
          };

          questionsStore.add(question);

          const state: QuestionState = {
            course_id: courseId,
            question_id: questionId,
            pool: "latent",
            last_shown: null,
            snooze_until: null,
            hidden: false,
            notes: "",
            consecutive_correct: 0,
            total_interactions: 0,
          };

          statesStore.add(state);
        });

        // Log course creation
        const logsStore = transaction.objectStore(STORE_NAMES.LOGS);
        logsStore.add({
          course_id: courseId,
          timestamp: now,
          type: "course_created" as EventType,
          details: {
            name,
            total_questions: questions.length,
            skipped_questions: errors.length,
          },
        });

        transaction.oncomplete = () => {
          resolve({
            course_id: courseId,
            total_loaded: questions.length,
            total_skipped: errors.length,
            validation_errors: errors,
          });
        };

        transaction.onerror = () => {
          reject(new Error(`Transaction failed: ${transaction.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async listCourses(): Promise<(CourseMetadata & CourseStats)[]> {
    if (!this.db) throw new Error("Database not initialized");

    const metadataStore = this.db
      .transaction(STORE_NAMES.COURSE_METADATA, "readonly")
      .objectStore(STORE_NAMES.COURSE_METADATA);

    const metadata = await this.getAllFromStore<CourseMetadata>(metadataStore);

    const coursesStore = this.db
      .transaction(STORE_NAMES.COURSES, "readonly")
      .objectStore(STORE_NAMES.COURSES);

    const stats = await this.getAllFromStore<CourseStats>(coursesStore);

    const statsMap = new Map(stats.map((s) => [s.id, s]));

    return metadata.map((m) => ({
      ...m,
      ...(statsMap.get(m.id) || {
        question_count: 0,
        latent_count: 0,
        test_count: 0,
        learned_count: 0,
        master_count: 0,
      }),
    }));
  }

  async deleteCourse(courseId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const transaction = this.db.transaction(
      [
        STORE_NAMES.COURSE_METADATA,
        STORE_NAMES.COURSES,
        STORE_NAMES.ORIGINAL_QUESTIONS,
        STORE_NAMES.QUESTION_STATES,
        STORE_NAMES.INTERACTIONS,
        STORE_NAMES.LOGS,
      ],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      try {
        // Delete from all stores
        transaction.objectStore(STORE_NAMES.COURSE_METADATA).delete(courseId);
        transaction.objectStore(STORE_NAMES.COURSES).delete(courseId);

        // Delete questions and states by course_id
        const questionsStore = transaction.objectStore(
          STORE_NAMES.ORIGINAL_QUESTIONS,
        );
        const questionsIndex = questionsStore.index("course_id");
        questionsIndex.openCursor(getIDBKeyRange().only(courseId)).onsuccess = (
          event,
        ) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        const statesStore = transaction.objectStore(
          STORE_NAMES.QUESTION_STATES,
        );
        const statesIndex = statesStore.index("course_id_pool");
        statesIndex.openCursor(
          getIDBKeyRange().bound([courseId], [courseId, "\uffff"]),
        ).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        // Delete interactions and logs by course_id
        const interactionsStore = transaction.objectStore(
          STORE_NAMES.INTERACTIONS,
        );
        const interactionsIndex = interactionsStore.index(
          "course_id_question_id_timestamp",
        );
        interactionsIndex.openCursor(
          getIDBKeyRange().bound([courseId], [courseId, "\uffff"]),
        ).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        const logsStore = transaction.objectStore(STORE_NAMES.LOGS);
        const logsIndex = logsStore.index("course_id_timestamp");
        logsIndex.openCursor(
          getIDBKeyRange().bound([courseId], [courseId, Infinity]),
        ).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          reject(new Error(`Transaction failed: ${transaction.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async resetCourse(courseId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const now = Date.now();
    const transaction = this.db.transaction(
      [
        STORE_NAMES.QUESTION_STATES,
        STORE_NAMES.INTERACTIONS,
        STORE_NAMES.LOGS,
        STORE_NAMES.COURSES,
      ],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      try {
        const statesStore = transaction.objectStore(
          STORE_NAMES.QUESTION_STATES,
        );
        const statesIndex = statesStore.index("course_id_pool");

        // Reset all question states
        statesIndex.openCursor(
          getIDBKeyRange().bound([courseId], [courseId, "\uffff"]),
        ).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const state = cursor.value as QuestionState;
            cursor.update({
              ...state,
              pool: "latent",
              last_shown: null,
              snooze_until: null,
              consecutive_correct: 0,
              total_interactions: 0,
            });
            cursor.continue();
          }
        };

        // Clear interactions
        const interactionsStore = transaction.objectStore(
          STORE_NAMES.INTERACTIONS,
        );
        const interactionsIndex = interactionsStore.index(
          "course_id_question_id_timestamp",
        );
        interactionsIndex.openCursor(
          getIDBKeyRange().bound([courseId], [courseId, "\uffff"]),
        ).onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        // Update course stats
        const coursesStore = transaction.objectStore(STORE_NAMES.COURSES);
        const getRequest = coursesStore.get(courseId);
        getRequest.onsuccess = () => {
          const stats = getRequest.result as CourseStats;
          coursesStore.put({
            ...stats,
            latent_count: stats.question_count,
            test_count: 0,
            learned_count: 0,
            master_count: 0,
          });
        };

        // Log reset
        const logsStore = transaction.objectStore(STORE_NAMES.LOGS);
        logsStore.add({
          course_id: courseId,
          timestamp: now,
          type: "course_reset" as EventType,
          details: { reset_at: now },
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          reject(new Error(`Transaction failed: ${transaction.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async getCourseStats(courseId: string): Promise<CourseStats> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.COURSES, "readonly")
      .objectStore(STORE_NAMES.COURSES);

    return new Promise((resolve, reject) => {
      const request = store.get(courseId);
      request.onsuccess = () => {
        const stats = request.result as CourseStats | undefined;
        if (!stats) {
          reject(new Error(`Course ${courseId} not found`));
        } else {
          resolve(stats);
        }
      };
      request.onerror = () => {
        reject(new Error(`Failed to get course stats: ${request.error}`));
      };
    });
  }

  // ========================================================================
  // Question Operations
  // ========================================================================

  async getQuestion(
    courseId: string,
    questionId: number,
  ): Promise<OriginalQuestion | undefined> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.ORIGINAL_QUESTIONS, "readonly")
      .objectStore(STORE_NAMES.ORIGINAL_QUESTIONS);

    return new Promise((resolve, reject) => {
      const request = store.get([courseId, questionId]);
      request.onsuccess = () => {
        resolve(request.result as OriginalQuestion | undefined);
      };
      request.onerror = () => {
        reject(new Error(`Failed to get question: ${request.error}`));
      };
    });
  }

  async getQuestionState(
    courseId: string,
    questionId: number,
  ): Promise<QuestionState | undefined> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
      .objectStore(STORE_NAMES.QUESTION_STATES);

    return new Promise((resolve, reject) => {
      const request = store.get([courseId, questionId]);
      request.onsuccess = () => {
        resolve(request.result as QuestionState | undefined);
      };
      request.onerror = () => {
        reject(new Error(`Failed to get question state: ${request.error}`));
      };
    });
  }

  async updateQuestionState(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.QUESTION_STATES, "readwrite")
      .objectStore(STORE_NAMES.QUESTION_STATES);

    return new Promise((resolve, reject) => {
      const getRequest = store.get([courseId, questionId]);
      getRequest.onsuccess = () => {
        const state = getRequest.result as QuestionState;
        const updated = { ...state, ...updates };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => {
          reject(
            new Error(`Failed to update question state: ${putRequest.error}`),
          );
        };
      };
      getRequest.onerror = () => {
        reject(new Error(`Failed to get question state: ${getRequest.error}`));
      };
    });
  }

  async hideQuestion(courseId: string, questionId: number): Promise<void> {
    await this.updateQuestionState(courseId, questionId, { hidden: true });
    await this.logEvent(courseId, "question_hidden", {
      question_id: questionId,
    });
  }

  async updateNotes(
    courseId: string,
    questionId: number,
    notes: string,
  ): Promise<void> {
    await this.updateQuestionState(courseId, questionId, { notes });
  }

  // ========================================================================
  // Interaction Operations
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
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.INTERACTIONS, "readwrite")
      .objectStore(STORE_NAMES.INTERACTIONS);

    const interaction: Interaction = {
      course_id: courseId,
      question_id: questionId,
      timestamp: Date.now(),
      answer_given: answer,
      correct,
      snooze_duration,
      selection_strategy: strategy,
      pool_at_time: pool,
    };

    return new Promise((resolve, reject) => {
      const request = store.add(interaction);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Failed to record interaction: ${request.error}`));
      };
    });
  }

  async getQuestionHistory(
    courseId: string,
    questionId: number,
  ): Promise<Interaction[]> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.INTERACTIONS, "readonly")
      .objectStore(STORE_NAMES.INTERACTIONS);

    const index = store.index("course_id_question_id_timestamp");
    const range = getIDBKeyRange().bound(
      [courseId, questionId],
      [courseId, questionId, Infinity],
    );

    return this.getAllFromIndex<Interaction>(index, range);
  }

  // ========================================================================
  // Selection Operations
  // ========================================================================

  async findNextQuestion(courseId: string): Promise<NextQuestionResult | null> {
    if (!this.db) throw new Error("Database not initialized");

    // This implements the two-tier probabilistic selection process
    // with latent auto-population

    const config = await this.getConfig();

    // Step 0: Auto-populate the test pool from latent if below threshold
    const stats = await this.getCourseStats(courseId);
    if (stats.test_count < config.latent_promotion_threshold) {
      const latentAvailable = await this.getAvailableQuestions(
        courseId,
        "latent",
      );
      const toPromote = Math.min(
        latentAvailable.length,
        config.test_pool_target_size - stats.test_count,
      );

      for (let i = 0; i < toPromote; i++) {
        const state = latentAvailable[i];
        await this.updateQuestionState(courseId, state.question_id, {
          pool: "test",
        });
      }

      // Update stats
      const transaction = this.db.transaction(STORE_NAMES.COURSES, "readwrite");
      const coursesStore = transaction.objectStore(STORE_NAMES.COURSES);
      const getRequest = coursesStore.get(courseId);
      getRequest.onsuccess = () => {
        const currentStats = getRequest.result as CourseStats;
        coursesStore.put({
          ...currentStats,
          latent_count: currentStats.latent_count - toPromote,
          test_count: currentStats.test_count + toPromote,
        });
      };

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error("Failed to update stats"));
      });

      if (toPromote > 0) {
        await this.logEvent(courseId, "latent_promotion", {
          promoted_count: toPromote,
          source: "latent",
          target: "test",
        });
      }
    }

    // Step 1: Select pool
    const rand = Math.random() * 100;
    let selectedPool: Pool;

    if (rand < config.pool_selection_test_upper) {
      selectedPool = "test";
    } else if (rand < config.pool_selection_learned_upper) {
      selectedPool = "learned";
    } else {
      selectedPool = "master";
    }

    // Try to get available questions from selected pool
    let available = await this.getAvailableQuestions(courseId, selectedPool);

    if (available.length === 0) {
      // Fallback to priority order
      for (const pool of ["test", "learned", "master"] as Pool[]) {
        available = await this.getAvailableQuestions(courseId, pool);
        if (available.length > 0) {
          selectedPool = pool;
          break;
        }
      }
    }

    if (available.length === 0) {
      return null;
    }

    // Step 2: Select question within pool
    const strategyRand = Math.random() * 100;
    let strategy: SelectionStrategy;

    if (strategyRand < config.strategy_oldest_upper) {
      strategy = "oldest";
    } else if (strategyRand < config.strategy_recovery_upper) {
      strategy = "recovery";
    } else {
      strategy = "random";
    }

    let selected: QuestionState | null = null;

    if (strategy === "oldest") {
      selected = available.reduce((prev, curr) => {
        const prevTime = prev.last_shown ?? Infinity;
        const currTime = curr.last_shown ?? Infinity;
        return prevTime < currTime ? prev : curr;
      });
    } else if (strategy === "recovery") {
      // Find previously mastered questions now demoted (approximated by high interaction count)
      const recovered = available.filter((s) => s.total_interactions >= 4);
      if (recovered.length > 0) {
        selected = recovered[Math.floor(Math.random() * recovered.length)];
      } else {
        strategy = "random";
      }
    }

    if (strategy === "random" || !selected) {
      selected = available[Math.floor(Math.random() * available.length)];
    }

    const question = await this.getQuestion(courseId, selected.question_id);
    if (!question) return null;

    return {
      question,
      state: selected,
      strategy,
    };
  }

  async getAvailableQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
      .objectStore(STORE_NAMES.QUESTION_STATES);

    const index = store.index("course_id_pool");
    const range = getIDBKeyRange().bound([courseId, pool], [courseId, pool]);

    const states = await this.getAllFromIndex<QuestionState>(index, range);

    const now = Date.now();
    return states.filter(
      (state) =>
        !state.hidden &&
        (state.snooze_until === null || state.snooze_until <= now),
    );
  }

  async getAllQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
      .objectStore(STORE_NAMES.QUESTION_STATES);

    const index = store.index("course_id_pool");
    const range = getIDBKeyRange().bound([courseId, pool], [courseId, pool]);

    return await this.getAllFromIndex<QuestionState>(index, range);
  }

  // ========================================================================
  // Logging Operations
  // ========================================================================

  async logEvent(
    courseId: string,
    type: EventType,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.LOGS, "readwrite")
      .objectStore(STORE_NAMES.LOGS);

    const entry: LogEntry = {
      course_id: courseId,
      timestamp: Date.now(),
      type,
      details,
    };

    return new Promise((resolve, reject) => {
      const request = store.add(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Failed to log event: ${request.error}`));
      };
    });
  }

  async getEventLog(
    courseId: string,
    limit = 100,
    offset = 0,
  ): Promise<LogEntry[]> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.LOGS, "readonly")
      .objectStore(STORE_NAMES.LOGS);

    const index = store.index("course_id_timestamp");
    const range = getIDBKeyRange().bound([courseId], [courseId, Infinity]);

    const allLogs = await this.getAllFromIndex<LogEntry>(index, range);

    // Sort by timestamp descending (most recent first)
    allLogs.sort((a, b) => b.timestamp - a.timestamp);

    return allLogs.slice(offset, offset + limit);
  }

  // ========================================================================
  // Configuration Operations
  // ========================================================================

  async getConfig(): Promise<Configuration> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.CONFIGURATION, "readonly")
      .objectStore(STORE_NAMES.CONFIGURATION);

    return new Promise((resolve, reject) => {
      const request = store.get("global");
      request.onsuccess = () => {
        const config = request.result as Configuration | undefined;
        if (!config) {
          reject(new Error("Configuration not found"));
        } else {
          resolve(config);
        }
      };
      request.onerror = () => {
        reject(new Error(`Failed to get configuration: ${request.error}`));
      };
    });
  }

  async updateConfig(updates: Partial<Configuration>): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const store = this.db
      .transaction(STORE_NAMES.CONFIGURATION, "readwrite")
      .objectStore(STORE_NAMES.CONFIGURATION);

    return new Promise((resolve, reject) => {
      const getRequest = store.get("global");
      getRequest.onsuccess = () => {
        const config = getRequest.result as Configuration;
        const updated = { ...config, ...updates };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => {
          reject(
            new Error(`Failed to update configuration: ${putRequest.error}`),
          );
        };
      };
      getRequest.onerror = () => {
        reject(new Error(`Failed to get configuration: ${getRequest.error}`));
      };
    });
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private getAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result as T[]);
      };
      request.onerror = () => {
        reject(new Error(`Failed to get all from store: ${request.error}`));
      };
    });
  }

  private getAllFromIndex<T>(
    index: IDBIndex,
    range?: IDBValidKey | IDBKeyRange,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = range ? index.getAll(range) : index.getAll();
      request.onsuccess = () => {
        resolve(request.result as T[]);
      };
      request.onerror = () => {
        reject(new Error(`Failed to get all from index: ${request.error}`));
      };
    });
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export default IndexedDBLayer;
