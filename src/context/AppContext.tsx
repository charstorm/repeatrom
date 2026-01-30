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
} from "../data/data-layer.ts";
import { IndexedDBLayer } from "../data/data-layer-indexdb.ts";
import { processAnswerPure } from "../data/answer-processor.ts";

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
  urlCourseMessage: { type: "success" | "error"; text: string } | null;
  clearUrlCourseMessage: () => void;
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
  const [urlCourseMessage, setUrlCourseMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const clearUrlCourseMessage = useCallback(
    () => setUrlCourseMessage(null),
    [],
  );

  useEffect(() => {
    dataLayer.initialize().then(async () => {
      await dataLayer.loadExternalConfig();
      setReady(true);
      const list = await dataLayer.listCourses();
      setCourses(list);

      // Check URL params for course creation
      const params = new URLSearchParams(window.location.search);
      const courseName = params.get("course_name");
      const coursePath = params.get("course_path");
      if (courseName && coursePath) {
        // Clean URL params immediately
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(null, "", cleanUrl);

        let url: string;
        if (
          coursePath.startsWith("http://") ||
          coursePath.startsWith("https://")
        ) {
          url = coursePath;
        } else if (coursePath.startsWith("courses/")) {
          url =
            "https://raw.githubusercontent.com/charstorm/repeatrom/refs/heads/deploy/data/" +
            coursePath;
        } else {
          setUrlCourseMessage({
            type: "error",
            text: `Course creation failed: unknown path "${coursePath}". Download the JSON and load manually.`,
          });
          return;
        }

        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(
              `Failed to fetch: ${resp.status} ${resp.statusText}`,
            );
          }
          const json = await resp.json();
          const result = await dataLayer.createCourse(courseName, json);
          if (result.total_loaded === 0) {
            setUrlCourseMessage({
              type: "error",
              text: `Course "${courseName}" creation failed: no valid questions found (${result.total_skipped} skipped).`,
            });
          } else {
            const skippedNote =
              result.total_skipped > 0
                ? ` (${result.total_skipped} questions skipped)`
                : "";
            setUrlCourseMessage({
              type: "success",
              text: `Course "${courseName}" created with ${result.total_loaded} questions.${skippedNote}`,
            });
            setCourses(await dataLayer.listCourses());
          }
        } catch (e) {
          setUrlCourseMessage({
            type: "error",
            text: `Course "${courseName}" creation failed: ${e instanceof Error ? e.message : "Unknown error"}`,
          });
        }
      }
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
      const now = Date.now();
      const config = await dataLayer.getConfig();
      const ar = processAnswerPure(result, selectedAnswer, config, now);

      // Log promotion/demotion events
      for (const event of ar.events) {
        await dataLayer.logEvent(courseId, event.type, event.details);
      }

      await dataLayer.updateQuestionStateWithPoolTransition(
        courseId,
        result.state.question_id,
        ar.stateUpdates,
        ar.oldPool,
        ar.newPool,
      );

      await dataLayer.recordInteraction(
        courseId,
        result.state.question_id,
        selectedAnswer,
        ar.correct,
        result.strategy,
        ar.oldPool,
        ar.snoozeDurationMinutes,
      );
      await dataLayer.logEvent(courseId, "user_interaction", {
        question_id: result.state.question_id,
        answer: selectedAnswer,
        correct: ar.correct,
        pool: ar.oldPool,
        new_pool: ar.newPool,
        strategy: result.strategy,
      });

      await dataLayer.updateLastAccessed(courseId);

      if (ar.needsTestPoolRefill) {
        await dataLayer.refillTestPoolFromLatent(courseId);
      }

      return ar.correct;
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
        urlCourseMessage,
        clearUrlCourseMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
