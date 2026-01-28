import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.tsx";
import type {
  QuestionState,
  OriginalQuestion,
  Interaction,
  LogEntry,
  Pool,
} from "../data/data-layer.ts";

type HistoryEntry =
  | { type: "interaction"; data: Interaction }
  | { type: "promotion"; data: LogEntry }
  | { type: "demotion"; data: LogEntry };

interface QuestionData {
  state: QuestionState;
  question: OriginalQuestion;
  history: HistoryEntry[];
}

export function ExpertScreen({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const { dataLayer, setScreen } = useApp();
  const [tab, setTab] = useState<"questions" | "logs">("questions");
  const [questions, setQuestions] = useState<Record<Pool, QuestionData[]>>({
    latent: [],
    test: [],
    learned: [],
    master: [],
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const pools: Pool[] = ["master", "learned", "test", "latent"];
      const result: Record<Pool, QuestionData[]> = {
        latent: [],
        test: [],
        learned: [],
        master: [],
      };

      // Fetch all logs first to merge into question history
      const logEntries = await dataLayer.getEventLog(courseId, 500);
      setLogs(logEntries);

      // Build a map of logs by question_id for quick lookup
      const logsByQuestionId = new Map<number, LogEntry[]>();
      for (const log of logEntries) {
        const qid = log.details?.question_id as number | undefined;
        if (
          qid !== undefined &&
          (log.type === "promotion" || log.type === "demotion")
        ) {
          if (!logsByQuestionId.has(qid)) {
            logsByQuestionId.set(qid, []);
          }
          logsByQuestionId.get(qid)!.push(log);
        }
      }

      for (const pool of pools) {
        const states = await dataLayer.getAllQuestions(courseId, pool);
        for (const state of states) {
          const question = await dataLayer.getQuestion(
            courseId,
            state.question_id,
          );
          const interactions = await dataLayer.getQuestionHistory(
            courseId,
            state.question_id,
          );
          const questionLogs = logsByQuestionId.get(state.question_id) || [];

          // Merge interactions and logs into unified history
          const history: HistoryEntry[] = [
            ...interactions.map((i) => ({
              type: "interaction" as const,
              data: i,
            })),
            ...questionLogs.map((l) => ({
              type: l.type as "promotion" | "demotion",
              data: l,
            })),
          ];

          // Sort by timestamp descending (newest first)
          history.sort((a, b) => {
            const tsA =
              a.type === "interaction" ? a.data.timestamp : a.data.timestamp;
            const tsB =
              b.type === "interaction" ? b.data.timestamp : b.data.timestamp;
            return tsB - tsA;
          });

          if (question) result[pool].push({ state, question, history });
        }
      }

      setQuestions(result);
      setLoading(false);
    })();
  }, [dataLayer, courseId]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Expert View: {courseName}</h1>
        <button
          onClick={() => setScreen({ type: "course_list" })}
          className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
        >
          Back
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("questions")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "questions" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Questions
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "logs" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Event Log
        </button>
      </div>

      {tab === "questions" && (
        <div className="space-y-6">
          <div className="flex gap-4 text-sm text-gray-500">
            <span>
              Total{" "}
              <span className="font-medium text-gray-700">
                {questions.latent.length +
                  questions.test.length +
                  questions.learned.length +
                  questions.master.length}
              </span>
            </span>
            <span>
              Latent{" "}
              <span className="font-medium text-gray-700">
                {questions.latent.length}
              </span>
            </span>
            <span>
              Test{" "}
              <span className="font-medium text-gray-700">
                {questions.test.length}
              </span>
            </span>
            <span>
              Learned{" "}
              <span className="font-medium text-gray-700">
                {questions.learned.length}
              </span>
            </span>
            <span>
              Master{" "}
              <span className="font-medium text-gray-700">
                {questions.master.length}
              </span>
            </span>
          </div>
          {(["master", "learned", "test", "latent"] as Pool[]).map((pool) => (
            <div key={pool}>
              <h3 className="text-lg font-semibold capitalize mb-2">
                {pool}{" "}
                <span className="text-gray-400 text-sm">
                  ({questions[pool].length})
                </span>
              </h3>
              {questions[pool].length === 0 ? (
                <p className="text-gray-400 text-sm ml-4">No questions</p>
              ) : (
                <div className="space-y-1">
                  {questions[pool].map(({ state, question, history }) => (
                    <div
                      key={state.question_id}
                      className="bg-white border rounded p-3"
                    >
                      <div
                        className="flex justify-between items-start cursor-pointer"
                        onClick={() => toggleExpand(state.question_id)}
                      >
                        <div className="flex-1">
                          <span className="text-sm font-mono text-gray-400 mr-2">
                            #{state.question_id}
                          </span>
                          <span className="text-sm">{question.question}</span>
                          {state.hidden && (
                            <span className="ml-2 text-xs bg-red-100 text-red-600 px-1 rounded">
                              hidden
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                          {state.total_interactions} interactions
                        </div>
                      </div>
                      {expanded.has(state.question_id) && (
                        <div className="mt-3 pl-4 border-l-2 border-gray-200">
                          <div className="text-xs text-gray-500 space-y-1 mb-2">
                            <p>
                              Consecutive correct: {state.consecutive_correct}
                            </p>
                            {state.was_demoted && (
                              <p className="text-orange-600 font-medium">
                                Status: Demoted (recovering)
                              </p>
                            )}
                            <p>
                              Last shown:{" "}
                              {state.last_shown
                                ? formatDate(state.last_shown)
                                : "Never"}
                            </p>
                            <p>
                              Snooze until:{" "}
                              {state.snooze_until
                                ? formatDate(state.snooze_until)
                                : "None"}
                            </p>
                            <p>Notes: {state.notes || "—"}</p>
                          </div>
                          {history.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-gray-500 mb-1">
                                History:
                              </p>
                              <div className="text-xs text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                                {history.map((entry, i) => {
                                  if (entry.type === "interaction") {
                                    const h = entry.data;
                                    return (
                                      <p key={i}>
                                        {formatDate(h.timestamp)} — pool:{" "}
                                        {h.pool_at_time} —{" "}
                                        {h.correct ? "Correct" : "Wrong"} (
                                        {h.answer_given}) —{" "}
                                        {h.selection_strategy} — snooze{" "}
                                        {h.snooze_duration}min
                                      </p>
                                    );
                                  } else if (entry.type === "promotion") {
                                    const l = entry.data;
                                    const from = String(
                                      l.details?.from ||
                                        l.details?.source ||
                                        "",
                                    );
                                    const to = String(
                                      l.details?.to || l.details?.target || "",
                                    );
                                    return (
                                      <p
                                        key={i}
                                        className="text-green-600 font-medium"
                                      >
                                        {formatDate(l.timestamp)} — PROMOTED:{" "}
                                        {from} → {to}
                                      </p>
                                    );
                                  } else {
                                    const l = entry.data;
                                    const from = String(l.details?.from || "");
                                    const to = String(l.details?.to || "");
                                    return (
                                      <p
                                        key={i}
                                        className="text-orange-600 font-medium"
                                      >
                                        {formatDate(l.timestamp)} — DEMOTED:{" "}
                                        {from} → {to}
                                      </p>
                                    );
                                  }
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-white border rounded-lg p-4 max-h-[70vh] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-400">No events logged.</p>
          ) : (
            <div className="text-xs font-mono space-y-1">
              {logs.map((log, i) => (
                <p key={i} className="text-gray-600">
                  <span className="text-gray-400">
                    {formatDate(log.timestamp)}
                  </span>{" "}
                  <span className="font-semibold">{log.type}</span>{" "}
                  {JSON.stringify(log.details)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
