import { AppProvider, useApp } from "./context/AppContext.tsx";
import { CourseListScreen } from "./screens/CourseListScreen.tsx";
import { StudyScreen } from "./screens/StudyScreen.tsx";
import { FeedbackScreen } from "./screens/FeedbackScreen.tsx";
import { NoQuestionsScreen } from "./screens/NoQuestionsScreen.tsx";
import { CourseManageScreen } from "./screens/CourseManageScreen.tsx";
import { ExpertScreen } from "./screens/ExpertScreen.tsx";
import { ConfigScreen } from "./screens/ConfigScreen.tsx";

function Router() {
  const { screen } = useApp();

  switch (screen.type) {
    case "course_list":
      return <CourseListScreen />;
    case "course_manage":
      return <CourseManageScreen focusCourseId={screen.courseId} />;
    case "study":
      return (
        <StudyScreen
          courseId={screen.courseId}
          courseName={screen.courseName}
        />
      );
    case "feedback":
      return (
        <FeedbackScreen
          courseId={screen.courseId}
          courseName={screen.courseName}
          result={screen.result}
          selectedAnswer={screen.selectedAnswer}
          correct={screen.correct}
        />
      );
    case "no_questions":
      return (
        <NoQuestionsScreen
          courseId={screen.courseId}
          courseName={screen.courseName}
        />
      );
    case "expert":
      return (
        <ExpertScreen
          courseId={screen.courseId}
          courseName={screen.courseName}
        />
      );
    case "config":
      return <ConfigScreen />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-50">
        <Router />
      </div>
    </AppProvider>
  );
}
