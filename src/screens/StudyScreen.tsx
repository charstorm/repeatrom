import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext.tsx";
import type { NextQuestionResult } from "../data/data-layer.ts";

export function StudyScreen({ courseId, courseName }: { courseId: string; courseName: string }) {
  const { dataLayer, setScreen, processAnswer } = useApp();
  const [questionResult, setQuestionResult] = useState<NextQuestionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    const result = await dataLayer.findNextQuestion(courseId);
    if (!result) {
      setScreen({ type: "no_questions", courseId, courseName });
      return;
    }
    setQuestionResult(result);
    setLoading(false);
  }, [dataLayer, courseId, courseName, setScreen]);

  useEffect(() => { loadNext(); }, [loadNext]);

  const shuffledOptions = useMemo(() => {
    if (!questionResult) return [];
    const opts = [...questionResult.question.options];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }, [questionResult]);

  const handleSubmit = async () => {
    if (!selected || !questionResult) return;
    const correct = await processAnswer(courseId, questionResult, selected);
    setScreen({ type: "feedback", courseId, courseName, result: questionResult, selectedAnswer: selected, correct });
  };

  const handleDoubleClick = async (option: string) => {
    if (!questionResult) return;
    const correct = await processAnswer(courseId, questionResult, option);
    setScreen({ type: "feedback", courseId, courseName, result: questionResult, selectedAnswer: option, correct });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Loading question...</p></div>;
  }

  if (!questionResult) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-700">{courseName}</h2>
        <button onClick={() => setScreen({ type: "course_list" })} className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">End Session</button>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-4">
        <p className="text-lg">{questionResult.question.question}</p>
      </div>

      <div className="space-y-2 mb-6">
        {shuffledOptions.map((opt) => (
          <button key={opt}
            onClick={() => setSelected(opt)}
            onDoubleClick={() => handleDoubleClick(opt)}
            className={`w-full text-left p-4 rounded-lg border transition ${selected === opt ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
            {opt}
          </button>
        ))}
      </div>

      <button onClick={handleSubmit} disabled={!selected}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
        Submit Answer
      </button>
    </div>
  );
}
