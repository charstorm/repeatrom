import { useState, useRef } from "react";
import { useApp } from "../context/AppContext.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

export function CourseListScreen() {
  const { dataLayer, courses, refreshCourses, setScreen } = useApp();
  const [courseName, setCourseName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !courseName.trim()) {
      setError("Please provide a course name and select a JSON file.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await dataLayer.createCourse(courseName.trim(), json);
      if (result.total_loaded === 0) {
        setError(`No valid questions found. ${result.total_skipped} skipped.`);
      } else {
        setCourseName("");
        if (fileRef.current) fileRef.current.value = "";
        await refreshCourses();
      }
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await dataLayer.deleteCourse(deleteId);
    setDeleteId(null);
    await refreshCourses();
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">RepeatRom</h1>

      {courses.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Your Courses</h2>
          <div className="space-y-2">
            {courses.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-white border rounded-lg p-4">
                <div className="flex-1 cursor-pointer" onClick={() => setScreen({ type: "study", courseId: c.id, courseName: c.name })}>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-gray-500">
                    {c.question_count} questions &middot; Last accessed: {formatTime(c.last_accessed)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    T:{c.test_count} L:{c.learned_count} M:{c.master_count} Latent:{c.latent_count}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => setScreen({ type: "expert", courseId: c.id, courseName: c.name })} className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Expert</button>
                  <button onClick={() => setScreen({ type: "course_manage" })} className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Manage</button>
                  <button onClick={() => setDeleteId(c.id)} className="text-sm px-3 py-1 text-red-600 bg-red-50 rounded hover:bg-red-100">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">Create New Course</h2>
        <div className="space-y-3">
          <input type="text" placeholder="Course name" value={courseName} onChange={(e) => setCourseName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input ref={fileRef} type="file" accept=".json" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <button onClick={handleCreate} disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating ? "Creating..." : "Create Course"}
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </div>

      {deleteId && (
        <ConfirmDialog
          title="Delete Course"
          message="Are you sure you want to delete this course? This action cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
