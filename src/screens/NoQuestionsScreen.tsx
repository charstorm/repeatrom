import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext.tsx";

export function NoQuestionsScreen({ courseId, courseName }: { courseId: string; courseName: string }) {
  const { dataLayer, setScreen } = useApp();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    (async () => {
      const now = Date.now();
      const pools = ["test", "learned", "master"] as const;
      let earliest: number | null = null;
      for (const pool of pools) {
        const questions = await dataLayer.getAllQuestions(courseId, pool);
        for (const q of questions) {
          if (q.hidden) continue;
          if (q.snooze_until === null || q.snooze_until <= now) {
            if (!cancelled) setScreen({ type: "study", courseId, courseName });
            return;
          }
          if (earliest === null || q.snooze_until < earliest) {
            earliest = q.snooze_until;
          }
        }
      }
      if (!cancelled && earliest !== null) {
        setSecondsLeft(Math.max(1, Math.ceil((earliest - now) / 1000)));
      }
    })();
    return () => { cancelled = true; };
  }, [dataLayer, courseId, courseName, setScreen]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((s) => {
        if (s === null) return null;
        return s - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0) {
      setScreen({ type: "study", courseId, courseName });
    }
  }, [secondsLeft, courseId, courseName, setScreen]);

  const formatCountdown = (s: number) => {
    if (s >= 3600) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (s >= 60) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}m ${sec}s`;
    }
    return `${s}s`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white border rounded-lg p-8 text-center">
        <h2 className="text-xl font-semibold mb-3 text-gray-700">No Questions Available</h2>
        <p className="text-gray-500 mb-2">All questions are currently snoozed.</p>
        {secondsLeft !== null && secondsLeft > 0 && (
          <p className="text-blue-600 font-medium mb-6">
            Next question available in {formatCountdown(secondsLeft)}
          </p>
        )}
        {secondsLeft === null && (
          <p className="text-gray-400 mb-6">No upcoming questions found.</p>
        )}
        <div className="flex justify-center gap-3">
          <button onClick={() => setScreen({ type: "study", courseId, courseName })}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Try Again</button>
          <button onClick={() => { dataLayer.logEvent(courseId, "session_ended", {}); setScreen({ type: "course_list" }); }}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Exit Session</button>
        </div>
      </div>
    </div>
  );
}
