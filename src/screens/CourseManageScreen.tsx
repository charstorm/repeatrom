import { useState } from "react";
import { useApp } from "../context/AppContext.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

export function CourseManageScreen({ focusCourseId }: { focusCourseId?: string }) {
  const { dataLayer, courses, refreshCourses, setScreen } = useApp();
  const displayCourses = focusCourseId ? courses.filter((c) => c.id === focusCourseId) : courses;
  const [confirm, setConfirm] = useState<{ type: "reset" | "delete"; courseId: string; name: string } | null>(null);

  const handleConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "delete") {
      await dataLayer.deleteCourse(confirm.courseId);
      setConfirm(null);
      await refreshCourses();
      setScreen({ type: "course_list" });
    } else {
      await dataLayer.resetCourse(confirm.courseId);
      setConfirm(null);
      await refreshCourses();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Course Management</h1>
        <button onClick={() => setScreen({ type: "course_list" })} className="text-sm px-3 py-1 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Back</button>
      </div>

      {displayCourses.length === 0 ? (
        <p className="text-gray-500">No courses found.</p>
      ) : (
        <div className="space-y-3">
          {displayCourses.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-white border rounded-lg p-4">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-gray-500">{c.question_count} questions</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirm({ type: "reset", courseId: c.id, name: c.name })} className="text-sm px-3 py-1 text-orange-600 bg-orange-50 rounded hover:bg-orange-100">Reset Progress</button>
                <button onClick={() => setConfirm({ type: "delete", courseId: c.id, name: c.name })} className="text-sm px-3 py-1 text-red-600 bg-red-50 rounded hover:bg-red-100">Delete Course</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.type === "delete" ? "Delete Course" : "Reset Course"}
          message={confirm.type === "delete"
            ? `Delete "${confirm.name}"? This will permanently remove all data.`
            : `Reset "${confirm.name}"? This will clear all progress and return questions to initial state.`}
          confirmLabel={confirm.type === "delete" ? "Delete" : "Reset"}
          destructive
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
