import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  DataLayer,
  type CourseMetadata,
  type CourseStats,
  type NextQuestionResult,
  type Pool,
  type Configuration,
} from "../data/data-layer.ts";
import { IndexedDBLayer } from "../data/data-layer-indexdb.ts";

export type Screen =
  | { type: "course_list" }
  | { type: "course_manage"; courseId?: string }
  | { type: "study"; courseId: string; courseName: string }
  | {
      type: "feedback";
      courseId: string;
      courseName: string;
      result: NextQuestionResult;
      selectedAnswer: string;
      correct: boolean;
    }
  | { type: "no_questions"; courseId: string; courseName: string }
  | { type: "expert"; courseId: string; courseName: string }
  | { type: "config" };

interface AppState {
  dataLayer: DataLayer;
  screen: Screen;
  setScreen: (s: Screen) => void;
  courses: (CourseMetadata & CourseStats)[];
  refreshCourses: () => Promise<void>;
  processAnswer: (
    courseId: string,
    result: NextQuestionResult,
    selectedAnswer: string,
  ) => Promise<boolean>;
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

  useEffect(() => {
    if (ready && screen.type === "course_list") {
      dataLayer.listCourses().then(setCourses);
    }
  }, [ready, screen, dataLayer]);

  const processAnswer = useCallback(
    async (
      courseId: string,
      result: NextQuestionResult,
      selectedAnswer: string,
    ): Promise<boolean> => {
      const correct = selectedAnswer === result.question.correct_option;
      const now = Date.now();
      const config: Configuration = await dataLayer.getConfig();
      const state = result.state;
      const pool = state.pool as Pool;

      let snoozeDurationMinutes: number;
      let newPool: Pool = pool;
      let newConsecutiveCorrect = state.consecutive_correct;
      let newConsecutiveIncorrect = state.consecutive_incorrect ?? 0;
      let wasDemotedReset = false;

      let needsTestPoolRefill = false;

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
            await dataLayer.logEvent(courseId, "promotion", {
              question_id: state.question_id,
              from: "test",
              to: "learned",
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
            await dataLayer.logEvent(courseId, "promotion", {
              question_id: state.question_id,
              from: "learned",
              to: "master",
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
          await dataLayer.logEvent(courseId, "demotion", {
            question_id: state.question_id,
            from: "master",
            to: "learned",
          });
        } else if (
          pool === "learned" &&
          newConsecutiveIncorrect >= config.demotion_incorrect_count
        ) {
          newPool = "test";
          newConsecutiveIncorrect = 0;
          await dataLayer.logEvent(courseId, "demotion", {
            question_id: state.question_id,
            from: "learned",
            to: "test",
          });
        }
      }

      const snoozeUntil = DataLayer.calculateSnoozeUntil(
        now,
        snoozeDurationMinutes,
      );

      const wasDemoted =
        !correct &&
        newPool !== pool &&
        (pool === "master" || pool === "learned");

      await dataLayer.updateQuestionStateWithPoolTransition(
        courseId,
        state.question_id,
        {
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
        },
        pool,
        newPool,
      );

      await dataLayer.recordInteraction(
        courseId,
        state.question_id,
        selectedAnswer,
        correct,
        result.strategy,
        pool,
        snoozeDurationMinutes,
      );
      await dataLayer.logEvent(courseId, "user_interaction", {
        question_id: state.question_id,
        answer: selectedAnswer,
        correct,
        pool,
        new_pool: newPool,
        strategy: result.strategy,
      });

      await dataLayer.updateLastAccessed(courseId);

      // Refill test pool from latent if a question was promoted from test
      if (needsTestPoolRefill) {
        await dataLayer.refillTestPoolFromLatent(courseId);
      }

      return correct;
    },
    [dataLayer],
  );

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        dataLayer,
        screen,
        setScreen,
        courses,
        refreshCourses,
        processAnswer,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
