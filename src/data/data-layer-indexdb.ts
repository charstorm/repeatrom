/**
 * Data Layer - IndexedDB Implementation (Browser-only)
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

export class IndexedDBLayer implements IDatabase {
  private db: IDBDatabase | null = null;

  async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () =>
        reject(new Error(`Failed to open database: ${request.error}`));
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
    if (!db.objectStoreNames.contains(STORE_NAMES.COURSE_METADATA)) {
      const s = db.createObjectStore(STORE_NAMES.COURSE_METADATA, {
        keyPath: "id",
      });
      s.createIndex("name", "name", { unique: true });
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.COURSES)) {
      db.createObjectStore(STORE_NAMES.COURSES, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.ORIGINAL_QUESTIONS)) {
      const s = db.createObjectStore(STORE_NAMES.ORIGINAL_QUESTIONS, {
        keyPath: ["course_id", "id"],
      });
      s.createIndex("course_id", "course_id");
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.QUESTION_STATES)) {
      const s = db.createObjectStore(STORE_NAMES.QUESTION_STATES, {
        keyPath: ["course_id", "question_id"],
      });
      s.createIndex("course_id_pool", ["course_id", "pool"]);
      s.createIndex("course_id_snooze", ["course_id", "snooze_until"]);
      s.createIndex("course_id_hidden", ["course_id", "hidden"]);
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.INTERACTIONS)) {
      const s = db.createObjectStore(STORE_NAMES.INTERACTIONS, {
        keyPath: "id",
        autoIncrement: true,
      });
      s.createIndex("course_id_question_id_timestamp", [
        "course_id",
        "question_id",
        "timestamp",
      ]);
      s.createIndex("course_id_timestamp", ["course_id", "timestamp"]);
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.LOGS)) {
      const s = db.createObjectStore(STORE_NAMES.LOGS, {
        keyPath: "id",
        autoIncrement: true,
      });
      s.createIndex("course_id_timestamp", ["course_id", "timestamp"]);
    }
    if (!db.objectStoreNames.contains(STORE_NAMES.CONFIGURATION)) {
      const s = db.createObjectStore(STORE_NAMES.CONFIGURATION, {
        keyPath: "id",
      });
      s.add({
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

  private getDB(): IDBDatabase {
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  }

  private getAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result as T[]);
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  private getAllFromIndex<T>(
    index: IDBIndex,
    range?: IDBValidKey | IDBKeyRange,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const r = range ? index.getAll(range) : index.getAll();
      r.onsuccess = () => resolve(r.result as T[]);
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async createCourse(
    name: string,
    questionsJson: unknown,
  ): Promise<CourseCreationResult> {
    const db = this.getDB();
    const courseId = this.generateUUID();
    const now = Date.now();
    const { questions, errors } = DataLayer.parseQuestionsJson(questionsJson);

    // Check for duplicate course name
    const checkTx = db.transaction(STORE_NAMES.COURSE_METADATA, "readonly");
    const existingCourse = await new Promise<CourseMetadata | undefined>(
      (resolve) => {
        const index = checkTx
          .objectStore(STORE_NAMES.COURSE_METADATA)
          .index("name");
        const request = index.get(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      },
    );

    if (existingCourse) {
      throw new Error("A course with this name already exists.");
    }

    const tx = db.transaction(
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
      tx.objectStore(STORE_NAMES.COURSE_METADATA).add({
        id: courseId,
        name,
        created_at: now,
        last_accessed: now,
      });
      tx.objectStore(STORE_NAMES.COURSES).add({
        id: courseId,
        question_count: questions.length,
        latent_count: questions.length,
        test_count: 0,
        learned_count: 0,
        master_count: 0,
      });

      const qStore = tx.objectStore(STORE_NAMES.ORIGINAL_QUESTIONS);
      const sStore = tx.objectStore(STORE_NAMES.QUESTION_STATES);

      questions.forEach((q, index) => {
        const qid = index + 1;
        qStore.add({
          course_id: courseId,
          id: qid,
          question: String(q.question),
          options: Array.isArray(q.options)
            ? q.options.map(String)
            : [String(q.options)],
          correct_option: String(q.correct_option),
          explanation: String(q.explanation),
        } satisfies OriginalQuestion);
        sStore.add({
          course_id: courseId,
          question_id: qid,
          pool: "latent",
          last_shown: null,
          snooze_until: null,
          hidden: false,
          notes: "",
          consecutive_correct: 0,
          total_interactions: 0,
          was_demoted: false,
        } satisfies QuestionState);
      });

      tx.objectStore(STORE_NAMES.LOGS).add({
        course_id: courseId,
        timestamp: now,
        type: "course_created" as EventType,
        details: {
          name,
          total_questions: questions.length,
          skipped_questions: errors.length,
        },
      });

      tx.oncomplete = () =>
        resolve({
          course_id: courseId,
          total_loaded: questions.length,
          total_skipped: errors.length,
          validation_errors: errors,
        });
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error}`));
    });
  }

  async listCourses(): Promise<(CourseMetadata & CourseStats)[]> {
    const db = this.getDB();
    const metadata = await this.getAllFromStore<CourseMetadata>(
      db
        .transaction(STORE_NAMES.COURSE_METADATA, "readonly")
        .objectStore(STORE_NAMES.COURSE_METADATA),
    );
    const stats = await this.getAllFromStore<CourseStats>(
      db
        .transaction(STORE_NAMES.COURSES, "readonly")
        .objectStore(STORE_NAMES.COURSES),
    );
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
    const db = this.getDB();
    const tx = db.transaction(
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
      tx.objectStore(STORE_NAMES.COURSE_METADATA).delete(courseId);
      tx.objectStore(STORE_NAMES.COURSES).delete(courseId);

      const delByCursor = (
        store: IDBObjectStore,
        indexName: string,
        range: IDBKeyRange,
      ) => {
        store.index(indexName).openCursor(range).onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      };

      delByCursor(
        tx.objectStore(STORE_NAMES.ORIGINAL_QUESTIONS),
        "course_id",
        IDBKeyRange.only(courseId),
      );
      delByCursor(
        tx.objectStore(STORE_NAMES.QUESTION_STATES),
        "course_id_pool",
        IDBKeyRange.bound([courseId], [courseId, "\uffff"]),
      );
      delByCursor(
        tx.objectStore(STORE_NAMES.INTERACTIONS),
        "course_id_question_id_timestamp",
        IDBKeyRange.bound([courseId], [courseId, "\uffff"]),
      );
      delByCursor(
        tx.objectStore(STORE_NAMES.LOGS),
        "course_id_timestamp",
        IDBKeyRange.bound([courseId], [courseId, Infinity]),
      );

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error}`));
    });
  }

  async resetCourse(courseId: string): Promise<void> {
    const db = this.getDB();
    const now = Date.now();
    const tx = db.transaction(
      [
        STORE_NAMES.QUESTION_STATES,
        STORE_NAMES.INTERACTIONS,
        STORE_NAMES.LOGS,
        STORE_NAMES.COURSES,
      ],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      const statesIndex = tx
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .index("course_id_pool");
      statesIndex.openCursor(
        IDBKeyRange.bound([courseId], [courseId, "\uffff"]),
      ).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          const state = cursor.value as QuestionState;
          cursor.update({
            ...state,
            pool: "latent",
            last_shown: null,
            snooze_until: null,
            hidden: false,
            notes: "",
            consecutive_correct: 0,
            total_interactions: 0,
            was_demoted: false,
          });
          cursor.continue();
        }
      };

      const intIndex = tx
        .objectStore(STORE_NAMES.INTERACTIONS)
        .index("course_id_question_id_timestamp");
      intIndex.openCursor(
        IDBKeyRange.bound([courseId], [courseId, "\uffff"]),
      ).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Clear event logs
      const logIndex = tx
        .objectStore(STORE_NAMES.LOGS)
        .index("course_id_timestamp");
      logIndex.openCursor(
        IDBKeyRange.bound([courseId], [courseId, Infinity]),
      ).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      const getReq = tx.objectStore(STORE_NAMES.COURSES).get(courseId);
      getReq.onsuccess = () => {
        const stats = getReq.result as CourseStats;
        tx.objectStore(STORE_NAMES.COURSES).put({
          ...stats,
          latent_count: stats.question_count,
          test_count: 0,
          learned_count: 0,
          master_count: 0,
        });
      };

      // Log the reset event after clearing old logs
      tx.objectStore(STORE_NAMES.LOGS).add({
        course_id: courseId,
        timestamp: now,
        type: "course_reset" as EventType,
        details: { reset_at: now },
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error}`));
    });
  }

  async getCourseStats(courseId: string): Promise<CourseStats> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.COURSES, "readonly")
        .objectStore(STORE_NAMES.COURSES)
        .get(courseId);
      r.onsuccess = () => {
        if (!r.result) reject(new Error(`Course ${courseId} not found`));
        else resolve(r.result as CourseStats);
      };
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async getQuestion(
    courseId: string,
    questionId: number,
  ): Promise<OriginalQuestion | undefined> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.ORIGINAL_QUESTIONS, "readonly")
        .objectStore(STORE_NAMES.ORIGINAL_QUESTIONS)
        .get([courseId, questionId]);
      r.onsuccess = () => resolve(r.result as OriginalQuestion | undefined);
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async getQuestionState(
    courseId: string,
    questionId: number,
  ): Promise<QuestionState | undefined> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .get([courseId, questionId]);
      r.onsuccess = () => resolve(r.result as QuestionState | undefined);
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async updateQuestionState(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
  ): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const store = db
        .transaction(STORE_NAMES.QUESTION_STATES, "readwrite")
        .objectStore(STORE_NAMES.QUESTION_STATES);
      const gr = store.get([courseId, questionId]);
      gr.onsuccess = () => {
        const pr = store.put({ ...gr.result, ...updates });
        pr.onsuccess = () => resolve();
        pr.onerror = () => reject(new Error(`Failed: ${pr.error}`));
      };
      gr.onerror = () => reject(new Error(`Failed: ${gr.error}`));
    });
  }

  async updateQuestionStateWithPoolTransition(
    courseId: string,
    questionId: number,
    updates: Partial<QuestionState>,
    oldPool: Pool,
    newPool: Pool,
  ): Promise<void> {
    const db = this.getDB();
    const tx = db.transaction(
      [STORE_NAMES.QUESTION_STATES, STORE_NAMES.COURSES],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      const stateReq = tx
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .get([courseId, questionId]);
      stateReq.onsuccess = () => {
        const state = stateReq.result as QuestionState;
        tx.objectStore(STORE_NAMES.QUESTION_STATES).put({
          ...state,
          ...updates,
        });

        if (oldPool !== newPool) {
          const statsReq = tx.objectStore(STORE_NAMES.COURSES).get(courseId);
          statsReq.onsuccess = () => {
            const stats = statsReq.result as CourseStats;
            const oldPoolKey = `${oldPool}_count` as keyof CourseStats;
            const newPoolKey = `${newPool}_count` as keyof CourseStats;
            tx.objectStore(STORE_NAMES.COURSES).put({
              ...stats,
              [oldPoolKey]: (stats[oldPoolKey] as number) - 1,
              [newPoolKey]: (stats[newPoolKey] as number) + 1,
            });
          };
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error}`));
    });
  }

  async hideQuestion(courseId: string, questionId: number): Promise<void> {
    const db = this.getDB();
    const tx = db.transaction(
      [STORE_NAMES.QUESTION_STATES, STORE_NAMES.COURSES, STORE_NAMES.LOGS],
      "readwrite",
    );

    return new Promise((resolve, reject) => {
      const stateReq = tx
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .get([courseId, questionId]);
      stateReq.onsuccess = () => {
        const state = stateReq.result as QuestionState | undefined;
        if (state) {
          tx.objectStore(STORE_NAMES.QUESTION_STATES).put({
            ...state,
            hidden: true,
          });

          const statsReq = tx.objectStore(STORE_NAMES.COURSES).get(courseId);
          statsReq.onsuccess = () => {
            const stats = statsReq.result as CourseStats;
            const poolKey = `${state.pool}_count` as keyof CourseStats;
            tx.objectStore(STORE_NAMES.COURSES).put({
              ...stats,
              [poolKey]: (stats[poolKey] as number) - 1,
              question_count: stats.question_count - 1,
            });
          };
        }
      };

      tx.objectStore(STORE_NAMES.LOGS).add({
        course_id: courseId,
        timestamp: Date.now(),
        type: "question_hidden" as EventType,
        details: { question_id: questionId },
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error}`));
    });
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
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.INTERACTIONS, "readwrite")
        .objectStore(STORE_NAMES.INTERACTIONS)
        .add({
          course_id: courseId,
          question_id: questionId,
          timestamp: Date.now(),
          answer_given: answer,
          correct,
          snooze_duration,
          selection_strategy: strategy,
          pool_at_time: pool,
        } satisfies Interaction);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async getQuestionHistory(
    courseId: string,
    questionId: number,
  ): Promise<Interaction[]> {
    const db = this.getDB();
    return this.getAllFromIndex<Interaction>(
      db
        .transaction(STORE_NAMES.INTERACTIONS, "readonly")
        .objectStore(STORE_NAMES.INTERACTIONS)
        .index("course_id_question_id_timestamp"),
      IDBKeyRange.bound(
        [courseId, questionId],
        [courseId, questionId, Infinity],
      ),
    );
  }

  async findNextQuestion(courseId: string): Promise<NextQuestionResult | null> {
    const config = await this.getConfig();
    const stats = await this.getCourseStats(courseId);

    if (stats.test_count < config.latent_promotion_threshold) {
      const latentAvailable = await this.getAvailableQuestions(
        courseId,
        "latent",
      );
      latentAvailable.sort((a, b) => a.question_id - b.question_id);
      const toPromote = Math.min(
        latentAvailable.length,
        config.test_pool_target_size - stats.test_count,
      );

      if (toPromote > 0) {
        const db = this.getDB();
        const tx = db.transaction(
          [STORE_NAMES.QUESTION_STATES, STORE_NAMES.COURSES, STORE_NAMES.LOGS],
          "readwrite",
        );

        const stateStore = tx.objectStore(STORE_NAMES.QUESTION_STATES);
        for (let i = 0; i < toPromote; i++) {
          const q = latentAvailable[i];
          stateStore.put({ ...q, pool: "test" });
        }

        const statsReq = tx.objectStore(STORE_NAMES.COURSES).get(courseId);
        statsReq.onsuccess = () => {
          const cur = statsReq.result as CourseStats;
          tx.objectStore(STORE_NAMES.COURSES).put({
            ...cur,
            latent_count: cur.latent_count - toPromote,
            test_count: cur.test_count + toPromote,
          });
        };

        const timestamp = Date.now();

        // Log each individual question promotion
        for (let i = 0; i < toPromote; i++) {
          const q = latentAvailable[i];
          tx.objectStore(STORE_NAMES.LOGS).add({
            course_id: courseId,
            timestamp,
            type: "promotion" as EventType,
            details: {
              question_id: q.question_id,
              source: "latent",
              target: "test",
            },
          });
        }

        // Log batch event for summary
        tx.objectStore(STORE_NAMES.LOGS).add({
          course_id: courseId,
          timestamp,
          type: "latent_promotion" as EventType,
          details: {
            promoted_count: toPromote,
            source: "latent",
            target: "test",
          },
        });

        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(new Error("Failed"));
        });
      }
    }

    const rand = Math.random() * 100;
    let selectedPool: Pool =
      rand < config.pool_selection_test_upper
        ? "test"
        : rand < config.pool_selection_learned_upper
          ? "learned"
          : "master";

    let available = await this.getAvailableQuestions(courseId, selectedPool);
    if (available.length === 0) {
      for (const pool of ["test", "learned", "master"] as Pool[]) {
        available = await this.getAvailableQuestions(courseId, pool);
        if (available.length > 0) {
          selectedPool = pool;
          break;
        }
      }
    }
    if (available.length === 0) return null;

    const strategyRand = Math.random() * 100;
    let strategy: SelectionStrategy =
      strategyRand < config.strategy_oldest_upper
        ? "oldest"
        : strategyRand < config.strategy_recovery_upper
          ? "recovery"
          : "random";

    let selected: QuestionState | null = null;
    if (strategy === "oldest") {
      selected = available.reduce((prev, curr) =>
        (prev.last_shown ?? Infinity) < (curr.last_shown ?? Infinity)
          ? prev
          : curr,
      );
    } else if (strategy === "recovery") {
      const recovered = available.filter((s) => s.was_demoted);
      if (recovered.length > 0)
        selected = recovered[Math.floor(Math.random() * recovered.length)];
      else strategy = "random";
    }
    if (strategy === "random" || !selected) {
      selected = available[Math.floor(Math.random() * available.length)];
    }

    const question = await this.getQuestion(courseId, selected.question_id);
    if (!question) return null;
    return { question, state: selected, strategy };
  }

  async getAvailableQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    const db = this.getDB();
    const states = await this.getAllFromIndex<QuestionState>(
      db
        .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .index("course_id_pool"),
      IDBKeyRange.bound([courseId, pool], [courseId, pool]),
    );
    const now = Date.now();
    return states.filter(
      (s) => !s.hidden && (s.snooze_until === null || s.snooze_until <= now),
    );
  }

  async getAllQuestions(
    courseId: string,
    pool: Pool,
  ): Promise<QuestionState[]> {
    const db = this.getDB();
    return this.getAllFromIndex<QuestionState>(
      db
        .transaction(STORE_NAMES.QUESTION_STATES, "readonly")
        .objectStore(STORE_NAMES.QUESTION_STATES)
        .index("course_id_pool"),
      IDBKeyRange.bound([courseId, pool], [courseId, pool]),
    );
  }

  async updateCourseStats(
    courseId: string,
    updates: Partial<CourseStats>,
  ): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const store = db
        .transaction(STORE_NAMES.COURSES, "readwrite")
        .objectStore(STORE_NAMES.COURSES);
      const gr = store.get(courseId);
      gr.onsuccess = () => {
        const pr = store.put({ ...gr.result, ...updates });
        pr.onsuccess = () => resolve();
        pr.onerror = () => reject(new Error(`Failed: ${pr.error}`));
      };
      gr.onerror = () => reject(new Error(`Failed: ${gr.error}`));
    });
  }

  async updateLastAccessed(courseId: string): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const store = db
        .transaction(STORE_NAMES.COURSE_METADATA, "readwrite")
        .objectStore(STORE_NAMES.COURSE_METADATA);
      const gr = store.get(courseId);
      gr.onsuccess = () => {
        if (!gr.result) {
          resolve();
          return;
        }
        const pr = store.put({ ...gr.result, last_accessed: Date.now() });
        pr.onsuccess = () => resolve();
        pr.onerror = () => reject(new Error(`Failed: ${pr.error}`));
      };
      gr.onerror = () => reject(new Error(`Failed: ${gr.error}`));
    });
  }

  async logEvent(
    courseId: string,
    type: EventType,
    details: Record<string, unknown>,
  ): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.LOGS, "readwrite")
        .objectStore(STORE_NAMES.LOGS)
        .add({
          course_id: courseId,
          timestamp: Date.now(),
          type,
          details,
        } satisfies LogEntry);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async getEventLog(
    courseId: string,
    limit = 100,
    offset = 0,
  ): Promise<LogEntry[]> {
    const db = this.getDB();
    const allLogs = await this.getAllFromIndex<LogEntry>(
      db
        .transaction(STORE_NAMES.LOGS, "readonly")
        .objectStore(STORE_NAMES.LOGS)
        .index("course_id_timestamp"),
      IDBKeyRange.bound([courseId], [courseId, Infinity]),
    );
    allLogs.sort((a, b) => b.timestamp - a.timestamp);
    return allLogs.slice(offset, offset + limit);
  }

  async getConfig(): Promise<Configuration> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction(STORE_NAMES.CONFIGURATION, "readonly")
        .objectStore(STORE_NAMES.CONFIGURATION)
        .get("global");
      r.onsuccess = () => {
        if (!r.result) reject(new Error("Config not found"));
        else resolve(r.result as Configuration);
      };
      r.onerror = () => reject(new Error(`Failed: ${r.error}`));
    });
  }

  async updateConfig(updates: Partial<Configuration>): Promise<void> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const store = db
        .transaction(STORE_NAMES.CONFIGURATION, "readwrite")
        .objectStore(STORE_NAMES.CONFIGURATION);
      const gr = store.get("global");
      gr.onsuccess = () => {
        const pr = store.put({ ...gr.result, ...updates });
        pr.onsuccess = () => resolve();
        pr.onerror = () => reject(new Error(`Failed: ${pr.error}`));
      };
      gr.onerror = () => reject(new Error(`Failed: ${gr.error}`));
    });
  }
}

export default IndexedDBLayer;
