import { useApp } from "../context/AppContext.tsx";

export function NoQuestionsScreen({ courseId, courseName }: { courseId: string; courseName: string }) {
  const { setScreen } = useApp();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white border rounded-lg p-8 text-center">
        <h2 className="text-xl font-semibold mb-3 text-gray-700">No Questions Available</h2>
        <p className="text-gray-500 mb-6">All questions are currently snoozed. Please wait for them to become available or exit the session.</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => setScreen({ type: "study", courseId, courseName })}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Try Again</button>
          <button onClick={() => setScreen({ type: "course_list" })}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Exit Session</button>
        </div>
      </div>
    </div>
  );
}
