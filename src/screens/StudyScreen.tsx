import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.tsx";
import type { NextQuestionResult } from "../data/data-layer.ts";

function shuffleArray(arr: string[]): string[] {
  const opts = [...arr];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

interface QuestionData {
  result: NextQuestionResult;
  shuffled: string[];
}

export function StudyScreen({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const { dataLayer, setScreen, processAnswer } = useApp();
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dataLayer
      .findNextQuestion(courseId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setScreen({ type: "no_questions", courseId, courseName });
          return;
        }
        setQuestionData({
          result,
          shuffled: shuffleArray(result.question.options),
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load question:", err);
        setScreen({ type: "no_questions", courseId, courseName });
      });
    return () => {
      cancelled = true;
    };
  }, [dataLayer, courseId, courseName, setScreen]);

  const handleSubmit = async () => {
    if (!selected || !questionData || submitting) return;
    setSubmitting(true);
    const correct = await processAnswer(
      courseId,
      questionData.result,
      selected,
    );
    setScreen({
      type: "feedback",
      courseId,
      courseName,
      result: questionData.result,
      selectedAnswer: selected,
      correct,
    });
  };

  const handleDoubleClick = async (option: string) => {
    if (!questionData || submitting) return;
    setSubmitting(true);
    const correct = await processAnswer(courseId, questionData.result, option);
    setScreen({
      type: "feedback",
      courseId,
      courseName,
      result: questionData.result,
      selectedAnswer: option,
      correct,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading question...</p>
      </div>
    );
  }

  if (!questionData) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-700">{courseName}</h2>
        <button
          onClick={() => {
            dataLayer.logEvent(courseId, "session_ended", {});
            setScreen({ type: "course_list" });
          }}
          className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
        >
          End Session
        </button>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-4">
        <p className="text-lg">{questionData.result.question.question}</p>
      </div>

      <div className="space-y-2 mb-6">
        {questionData.shuffled.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => setSelected(opt)}
            onDoubleClick={() => handleDoubleClick(opt)}
            className={`w-full text-left p-4 rounded-lg border transition ${selected === opt ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 bg-white hover:bg-gray-50"}`}
          >
            {opt}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selected || submitting}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Submit Answer"}
      </button>
    </div>
  );
}
