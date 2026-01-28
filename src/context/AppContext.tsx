import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { DataLayer, type CourseMetadata, type CourseStats, type NextQuestionResult, type Pool, type Configuration } from "../data/data-layer.ts";
import { IndexedDBLayer } from "../data/data-layer-indexdb.ts";

export type Screen =
  | { type: "course_list" }
  | { type: "course_manage"; courseId?: string }
  | { type: "study"; courseId: string; courseName: string }
  | { type: "feedback"; courseId: string; courseName: string; result: NextQuestionResult; selectedAnswer: string; correct: boolean }
  | { type: "no_questions"; courseId: string; courseName: string }
  | { type: "expert"; courseId: string; courseName: string };

interface AppState {
  dataLayer: DataLayer;
  screen: Screen;
  setScreen: (s: Screen) => void;
  courses: (CourseMetadata & CourseStats)[];
  refreshCourses: () => Promise<void>;
  processAnswer: (courseId: string, result: NextQuestionResult, selectedAnswer: string) => Promise<boolean>;
}

const AppContext = createContext<AppState | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [dataLayer] = useState(() => {
    const db = new IndexedDBLayer();
    return new DataLayer(db);
  });
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ type: "course_list" });
  const [courses, setCourses] = useState<(CourseMetadata & CourseStats)[]>([]);

  useEffect(() => {
    dataLayer.initialize().then(() => {
      setReady(true);
      dataLayer.listCourses().then(setCourses);
    });
  }, [dataLayer]);

  const refreshCourses = useCallback(async () => {
    const list = await dataLayer.listCourses();
    setCourses(list);
  }, [dataLayer]);

  const processAnswer = useCallback(async (courseId: string, result: NextQuestionResult, selectedAnswer: string): Promise<boolean> => {
    const correct = selectedAnswer === result.question.correct_option;
    const now = Date.now();
    const config: Configuration = await dataLayer.getConfig();
    const state = result.state;
    const pool = state.pool as Pool;

    let snoozeDurationMinutes: number;
    let newPool: Pool = pool;
    let newConsecutiveCorrect = state.consecutive_correct;

    if (correct) {
      newConsecutiveCorrect += 1;
      if (pool === "test") {
        snoozeDurationMinutes = config.snooze_test_correct_minutes;
        if (newConsecutiveCorrect >= config.promotion_consecutive_correct) {
          newPool = "learned";
          newConsecutiveCorrect = 0;
          await dataLayer.logEvent(courseId, "promotion", { question_id: state.question_id, from: "test", to: "learned" });
        }
      } else if (pool === "learned") {
        snoozeDurationMinutes = DataLayer.hoursToMinutes(config.snooze_learned_correct_hours);
        if (newConsecutiveCorrect >= config.promotion_consecutive_correct) {
          newPool = "master";
          newConsecutiveCorrect = 0;
          await dataLayer.logEvent(courseId, "promotion", { question_id: state.question_id, from: "learned", to: "master" });
        }
      } else {
        snoozeDurationMinutes = DataLayer.daysToMinutes(config.snooze_master_correct_days);
      }
    } else {
      newConsecutiveCorrect = 0;
      snoozeDurationMinutes = config.snooze_incorrect_minutes;
      if (pool === "master") {
        newPool = "learned";
        await dataLayer.logEvent(courseId, "demotion", { question_id: state.question_id, from: "master", to: "learned" });
      } else if (pool === "learned") {
        newPool = "test";
        await dataLayer.logEvent(courseId, "demotion", { question_id: state.question_id, from: "learned", to: "test" });
      }
    }

    const snoozeUntil = DataLayer.calculateSnoozeUntil(now, snoozeDurationMinutes);

    const wasDemoted = !correct && (pool === "master" || pool === "learned");

    await dataLayer.updateQuestionState(courseId, state.question_id, {
      pool: newPool,
      last_shown: now,
      snooze_until: snoozeUntil,
      consecutive_correct: newConsecutiveCorrect,
      total_interactions: state.total_interactions + 1,
      ...(wasDemoted ? { was_demoted: true } : {}),
    });

    await dataLayer.recordInteraction(courseId, state.question_id, selectedAnswer, correct, result.strategy, pool, snoozeDurationMinutes);
    await dataLayer.logEvent(courseId, "user_interaction", {
      question_id: state.question_id,
      answer: selectedAnswer,
      correct,
      pool,
      new_pool: newPool,
      strategy: result.strategy,
    });

    if (newPool !== pool) {
      const stats = await dataLayer.getCourseStats(courseId);
      const poolCountKey = (p: Pool) => `${p}_count` as keyof CourseStats;
      await dataLayer.updateCourseStats(courseId, {
        [poolCountKey(pool)]: (stats[poolCountKey(pool)] as number) - 1,
        [poolCountKey(newPool)]: (stats[poolCountKey(newPool)] as number) + 1,
      });
    }

    await dataLayer.updateLastAccessed(courseId);

    return correct;
  }, [dataLayer]);

  if (!ready) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-50"><p className="text-gray-500 text-lg">Loading...</p></div>;
  }

  return (
    <AppContext.Provider value={{ dataLayer, screen, setScreen, courses, refreshCourses, processAnswer }}>
      {children}
    </AppContext.Provider>
  );
}
