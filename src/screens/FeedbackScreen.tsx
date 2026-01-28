import { useState } from "react";
import { useApp } from "../context/AppContext.tsx";
import type { NextQuestionResult } from "../data/data-layer.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

interface Props {
  courseId: string;
  courseName: string;
  result: NextQuestionResult;
  selectedAnswer: string;
  correct: boolean;
}

export function FeedbackScreen({ courseId, courseName, result, selectedAnswer, correct }: Props) {
  const { dataLayer, setScreen } = useApp();
  const [notes, setNotes] = useState(result.state.notes);
  const [editingNotes, setEditingNotes] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);

  const saveNotes = async () => {
    await dataLayer.updateNotes(courseId, result.state.question_id, notes);
    setEditingNotes(false);
  };

  const hideQuestion = async () => {
    await dataLayer.hideQuestion(courseId, result.state.question_id);
    setShowHideConfirm(false);
    setScreen({ type: "study", courseId, courseName });
  };

  const nextQuestion = () => setScreen({ type: "study", courseId, courseName });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-700">{courseName}</h2>
        <button onClick={() => { dataLayer.logEvent(courseId, "session_ended", {}); setScreen({ type: "course_list" }); }} className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">End Session</button>
      </div>

      <div className={`rounded-lg p-6 mb-4 ${correct ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
        <h3 className={`text-xl font-bold mb-3 ${correct ? "text-green-700" : "text-red-700"}`}>
          {correct ? "Correct!" : "Incorrect"}
        </h3>

        {!correct && (
          <p className="text-red-600 mb-2">Your answer: <span className="font-medium">{selectedAnswer}</span></p>
        )}
        <p className={correct ? "text-green-700" : "text-gray-700"}>
          Correct answer: <span className="font-medium">{result.question.correct_option}</span>
        </p>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-4">
        <h4 className="font-semibold text-gray-700 mb-2">Explanation</h4>
        <p className="text-gray-600">{result.question.explanation}</p>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-semibold text-gray-700">Personal Notes</h4>
          {!editingNotes && <button onClick={() => setEditingNotes(true)} className="text-sm text-blue-600 hover:text-blue-700">Edit</button>}
        </div>
        {editingNotes ? (
          <div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Add your notes..." />
            <div className="flex gap-2 mt-2">
              <button onClick={saveNotes} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
              <button onClick={() => { setNotes(result.state.notes); setEditingNotes(false); }} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">{notes || "No notes yet."}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={nextQuestion} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Next Question</button>
        <button onClick={() => setShowHideConfirm(true)} className="px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100">Hide Question</button>
      </div>

      {showHideConfirm && (
        <ConfirmDialog
          title="Hide Question"
          message={`"${result.question.question}" — Hiding this question is permanent and cannot be undone.`}
          confirmLabel="Hide Permanently"
          destructive
          onConfirm={hideQuestion}
          onCancel={() => setShowHideConfirm(false)}
        />
      )}
    </div>
  );
}
