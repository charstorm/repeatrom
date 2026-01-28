import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext.tsx";

export function CourseListScreen() {
  const { dataLayer, courses, refreshCourses, setScreen } = useApp();
  const [courseName, setCourseName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !courseName.trim()) {
      setError("Please provide a course name and select a JSON file.");
      return;
    }
    setCreating(true);
    setError("");
    setInfo("");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await dataLayer.createCourse(courseName.trim(), json);
      if (result.total_loaded === 0) {
        setError(`No valid questions found. ${result.total_skipped} skipped.`);
      } else {
        setCourseName("");
        if (fileRef.current) fileRef.current.value = "";
        if (result.total_skipped > 0) {
          setInfo(
            `Course created: ${result.total_loaded} questions loaded, ${result.total_skipped} skipped due to validation errors.`,
          );
        } else {
          setInfo(`Course created: ${result.total_loaded} questions loaded.`);
        }
        await refreshCourses();
      }
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setCreating(false);
  };

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ts: number) => {
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">RepeatRom</h1>
        <a
          href="https://github.com/charstorm/repeatrom/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-700"
          title="View on GitHub"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>

      {courses.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Your Courses</h2>
          <div className="space-y-2">
            {courses.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-white border rounded-lg p-4"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    dataLayer.logEvent(c.id, "session_started", {});
                    setScreen({
                      type: "study",
                      courseId: c.id,
                      courseName: c.name,
                    });
                  }}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-gray-500">
                    {c.question_count} questions &middot; Last accessed:{" "}
                    {formatTime(c.last_accessed)}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() =>
                      setScreen({
                        type: "expert",
                        courseId: c.id,
                        courseName: c.name,
                      })
                    }
                    className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Expert
                  </button>
                  <button
                    onClick={() =>
                      setScreen({ type: "course_manage", courseId: c.id })
                    }
                    className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">Create New Course</h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Course name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Course"}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {info && <p className="text-green-600 text-sm">{info}</p>}
          <p className="text-sm text-gray-500">
            Need help?{" "}
            <a
              href="https://github.com/charstorm/repeatrom/blob/main/data/creating_a_new_course.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Learn how to create course data
            </a>
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-500 leading-relaxed">
        RepeatRom helps you memorize anything using spaced repetition
        flashcards. Upload your own multiple-choice questions, study adaptively,
        and watch topics move from unfamiliar to fully mastered. Everything runs
        entirely in your browser — no server, no account, no data leaves your
        device. Your progress is always private and available offline.
      </p>
    </div>
  );
}
