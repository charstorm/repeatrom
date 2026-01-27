/**
 * Main application entry point for Repeatrom Web App
 * Handles UI interactions, state management, and integration with data layer
 */

import DataLayer, {
  NextQuestionResult,
  QuestionState,
  OriginalQuestion,
} from "./data-layer.js";
import IndexedDBLayer from "./data-layer-indexdb.js";

interface AppState {
  currentCourseId: string | null;
  currentQuestion: NextQuestionResult | null;
  currentView:
    | "course-selection"
    | "study-session"
    | "course-management"
    | "expert-page";
  isInitialized: boolean;
}

class RepeatromApp {
  private dataLayer!: DataLayer;
  private state: AppState = {
    currentCourseId: null,
    currentQuestion: null,
    currentView: "course-selection",
    isInitialized: false,
  };

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      this.showLoading(true);

      // Initialize database
      const db = new IndexedDBLayer();
      await db.initDatabase();

      this.dataLayer = new DataLayer(db);
      await this.dataLayer.initialize();

      this.state.isInitialized = true;
      this.showLoading(false);

      // Set up event listeners
      this.setupEventListeners();

      // Show initial view
      this.showCourseSelection();
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showError(
        "Failed to initialize application. Please refresh and try again.",
      );
    }
  }

  private setupEventListeners(): void {
    // Course selection
    const courseFile = document.getElementById(
      "course-file",
    ) as HTMLInputElement;
    const createCourseBtn = document.getElementById(
      "create-course-btn",
    ) as HTMLButtonElement;
    courseFile?.addEventListener("change", this.handleFileSelect.bind(this));
    createCourseBtn?.addEventListener(
      "click",
      this.handleCreateCourse.bind(this),
    );

    // Study session
    const submitBtn = document.getElementById(
      "submit-answer-btn",
    ) as HTMLButtonElement;
    const endSessionBtn = document.getElementById(
      "end-session-btn",
    ) as HTMLButtonElement;
    const nextBtn = document.getElementById(
      "next-question-btn",
    ) as HTMLButtonElement;
    const hideBtn = document.getElementById(
      "hide-question-btn",
    ) as HTMLButtonElement;
    const saveNotesBtn = document.getElementById(
      "save-notes-btn",
    ) as HTMLButtonElement;
    const waitBtn = document.getElementById("wait-btn") as HTMLButtonElement;
    const exitBtn = document.getElementById(
      "exit-session-btn",
    ) as HTMLButtonElement;

    submitBtn?.addEventListener("click", this.handleSubmitAnswer.bind(this));
    endSessionBtn?.addEventListener("click", this.handleEndSession.bind(this));
    nextBtn?.addEventListener("click", this.handleNextQuestion.bind(this));
    hideBtn?.addEventListener("click", this.handleHideQuestion.bind(this));
    saveNotesBtn?.addEventListener("click", this.handleSaveNotes.bind(this));
    waitBtn?.addEventListener("click", this.handleWait.bind(this));
    exitBtn?.addEventListener("click", this.handleExitSession.bind(this));

    // Modals
    const confirmBtn = document.getElementById(
      "confirm-action-btn",
    ) as HTMLButtonElement;
    confirmBtn?.addEventListener("click", this.handleConfirmAction.bind(this));

    // Navigation
    const backBtn = document.getElementById(
      "back-to-courses-btn",
    ) as HTMLButtonElement;
    backBtn?.addEventListener("click", this.handleBackToCourses.bind(this));
  }

  private showLoading(show: boolean): void {
    const loadingEl = document.getElementById("loading-screen");
    const appEl = document.getElementById("app");
    if (show) {
      loadingEl?.classList.remove("d-none");
      appEl?.classList.add("d-none");
    } else {
      loadingEl?.classList.add("d-none");
      appEl?.classList.remove("d-none");
    }
  }

  private showError(message: string): void {
    this.showAlert("Error", message);
  }

  private showAlert(title: string, message: string): void {
    const titleEl = document.getElementById("alert-modal-title");
    const bodyEl = document.getElementById("alert-modal-body");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = message;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modal = new (window as any).bootstrap.Modal(
      document.getElementById("alert-modal"),
    );
    modal.show();
  }

  private showConfirm(
    title: string,
    message: string,
    callback: () => void,
  ): void {
    const titleEl = document.getElementById("confirm-modal-title");
    const bodyEl = document.getElementById("confirm-modal-body");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = message;
    this.pendingConfirmCallback = callback;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modal = new (window as any).bootstrap.Modal(
      document.getElementById("confirm-modal"),
    );
    modal.show();
  }

  private pendingConfirmCallback: (() => void) | null = null;

  private handleConfirmAction(): void {
    if (this.pendingConfirmCallback) {
      this.pendingConfirmCallback();
      this.pendingConfirmCallback = null;
    }
  }

  private async showCourseSelection(): Promise<void> {
    this.state.currentView = "course-selection";
    this.updateViewVisibility();

    const courses = await this.dataLayer.listCourses();
    const coursesList = document.getElementById("courses-list");
    const noCoursesMsg = document.getElementById("no-courses");

    if (!coursesList || !noCoursesMsg) return;

    coursesList.innerHTML = "";

    if (courses.length === 0) {
      noCoursesMsg.classList.remove("d-none");
      return;
    }

    noCoursesMsg.classList.add("d-none");

    courses.forEach((course) => {
      const li = document.createElement("li");
      li.className =
        "list-group-item d-flex justify-content-between align-items-center";

      const content = document.createElement("div");
      const nameEl = document.createElement("h5");
      nameEl.textContent = course.name;
      nameEl.className = "mb-1";

      const statsEl = document.createElement("p");
      statsEl.className = "mb-0 small text-muted";
      statsEl.textContent = `Questions: ${course.question_count} | Latent: ${course.latent_count} | Test: ${course.test_count} | Learned: ${course.learned_count} | Master: ${course.master_count}`;

      content.appendChild(nameEl);
      content.appendChild(statsEl);

      const buttons = document.createElement("div");
      buttons.className = "btn-group btn-group-sm";

      const startBtn = document.createElement("button");
      startBtn.className = "btn btn-outline-primary";
      startBtn.textContent = "Start";
      startBtn.addEventListener("click", () =>
        this.handleStartCourse(course.id),
      );

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-outline-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () =>
        this.handleDeleteCourse(course.id),
      );

      buttons.appendChild(startBtn);
      buttons.appendChild(deleteBtn);

      li.appendChild(content);
      li.appendChild(buttons);
      coursesList.appendChild(li);
    });
  }

  private async handleStartCourse(courseId: string): Promise<void> {
    this.state.currentCourseId = courseId;
    await this.dataLayer.logEvent(courseId, "session_started", {});
    await this.showStudySession();
  }

  private async showStudySession(): Promise<void> {
    if (!this.state.currentCourseId) return;

    this.state.currentView = "study-session";
    this.updateViewVisibility();

    const questionCard = document.getElementById("question-card");
    const noQuestionsCard = document.getElementById("no-questions-available");
    const feedbackCard = document.getElementById("feedback-card");

    if (!questionCard || !noQuestionsCard || !feedbackCard) return;

    questionCard.classList.add("d-none");
    noQuestionsCard.classList.add("d-none");
    feedbackCard.classList.add("d-none");

    const nextQuestion = await this.dataLayer.findNextQuestion(
      this.state.currentCourseId,
    );
    this.state.currentQuestion = nextQuestion;

    if (!nextQuestion) {
      noQuestionsCard.classList.remove("d-none");
      return;
    }

    this.displayQuestion(nextQuestion);
  }

  private displayQuestion(questionData: NextQuestionResult): void {
    const questionText = document.getElementById("question-text");
    const optionsList = document.getElementById("options-list");
    const submitBtn = document.getElementById(
      "submit-answer-btn",
    ) as HTMLButtonElement;

    if (!questionText || !optionsList || !submitBtn) return;

    questionText.textContent = questionData.question.question;
    optionsList.innerHTML = "";

    questionData.question.options.forEach((option: string) => {
      const li = document.createElement("li");
      li.className = "list-group-item";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.className = "form-check-input me-2";
      radio.name = "answer";
      radio.value = option;

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.textContent = option;

      li.appendChild(radio);
      li.appendChild(label);
      optionsList.appendChild(li);
    });

    submitBtn.disabled = true;

    // Enable submit when option selected
    optionsList.querySelectorAll('input[name="answer"]').forEach((radio) => {
      (radio as HTMLInputElement).addEventListener("change", () => {
        submitBtn.disabled = false;
      });
    });

    document.getElementById("question-card")?.classList.remove("d-none");
  }

  private async handleSubmitAnswer(): Promise<void> {
    if (!this.state.currentCourseId || !this.state.currentQuestion) return;

    const selectedAnswer = (
      document.querySelector('input[name="answer"]:checked') as HTMLInputElement
    )?.value;
    if (!selectedAnswer) return;

    const isCorrect =
      selectedAnswer === this.state.currentQuestion.question.correct_option;

    // Record interaction
    await this.dataLayer.recordInteraction(
      this.state.currentCourseId,
      this.state.currentQuestion.state.question_id,
      selectedAnswer,
      isCorrect,
      this.state.currentQuestion.strategy,
      this.state.currentQuestion.state.pool,
      this.calculateSnoozeDuration(isCorrect, this.state.currentQuestion.state),
    );

    // Update question state
    if (isCorrect) {
      await this.updateQuestionForCorrectAnswer(
        this.state.currentQuestion.state,
      );
    } else {
      await this.updateQuestionForIncorrectAnswer(
        this.state.currentQuestion.state,
      );
    }

    this.showFeedback(isCorrect, this.state.currentQuestion.question);
  }

  private calculateSnoozeDuration(
    isCorrect: boolean,
    state: QuestionState,
  ): number {
    const config = {
      snooze_incorrect_minutes: 1,
      snooze_test_correct_minutes: 10,
      snooze_learned_correct_hours: 24,
      snooze_master_correct_days: 7,
    };

    if (!isCorrect) {
      return config.snooze_incorrect_minutes;
    }

    switch (state.pool) {
      case "test":
        return config.snooze_test_correct_minutes;
      case "learned":
        return config.snooze_learned_correct_hours;
      case "master":
        return config.snooze_master_correct_days;
      default:
        return config.snooze_test_correct_minutes;
    }
  }

  private async updateQuestionForCorrectAnswer(
    state: QuestionState,
  ): Promise<void> {
    if (!this.state.currentCourseId) return;

    const updates: Partial<QuestionState> = {
      consecutive_correct: state.consecutive_correct + 1,
      total_interactions: state.total_interactions + 1,
      last_shown: Date.now(),
    };

    // Check for promotion
    if (updates.consecutive_correct! >= 2) {
      if (state.pool === "latent") {
        updates.pool = "test";
      } else if (state.pool === "test") {
        updates.pool = "learned";
      } else if (state.pool === "learned") {
        updates.pool = "master";
      }
    }

    await this.dataLayer.updateQuestionState(
      this.state.currentCourseId,
      state.question_id,
      updates,
    );
  }

  private async updateQuestionForIncorrectAnswer(
    state: QuestionState,
  ): Promise<void> {
    if (!this.state.currentCourseId) return;

    const updates: Partial<QuestionState> = {
      consecutive_correct: 0,
      total_interactions: state.total_interactions + 1,
      last_shown: Date.now(),
    };

    // Check for demotion
    if (state.pool === "master") {
      updates.pool = "learned";
    } else if (state.pool === "learned") {
      updates.pool = "test";
    }

    await this.dataLayer.updateQuestionState(
      this.state.currentCourseId,
      state.question_id,
      updates,
    );
  }

  private showFeedback(isCorrect: boolean, question: OriginalQuestion): void {
    const questionCard = document.getElementById("question-card");
    const feedbackCard = document.getElementById("feedback-card");
    const title = document.getElementById("feedback-title");
    const content = document.getElementById("feedback-content");

    if (!questionCard || !feedbackCard || !title || !content) return;

    questionCard.classList.add("d-none");
    feedbackCard.classList.remove("d-none");

    title.textContent = isCorrect ? "Correct!" : "Incorrect";
    title.className = isCorrect
      ? "card-title text-success"
      : "card-title text-danger";

    const explanationEl = document.createElement("p");
    explanationEl.textContent = question.explanation;

    const correctAnswerEl = document.createElement("p");
    correctAnswerEl.innerHTML = `<strong>Correct answer:</strong> ${question.correct_option}`;

    content.innerHTML = "";
    content.appendChild(explanationEl);
    content.appendChild(correctAnswerEl);
  }

  private handleFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const statusEl = document.getElementById("file-status");
    const btn = document.getElementById(
      "create-course-btn",
    ) as HTMLButtonElement;

    if (!statusEl || !btn) return;

    if (file) {
      statusEl.textContent = `Selected: ${file.name}`;
      btn.disabled = false;
    } else {
      statusEl.textContent = "No file selected";
      btn.disabled = true;
    }
  }

  private async handleCreateCourse(): Promise<void> {
    const fileInput = document.getElementById(
      "course-file",
    ) as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Prompt for course name
      const courseName = prompt("Enter course name:");
      if (!courseName) return;

      const result = await this.dataLayer.createCourse(courseName, json);

      if (result.validation_errors.length > 0) {
        this.showAlert(
          "Course Created with Errors",
          `Course "${courseName}" created successfully, but ${result.validation_errors.length} questions were skipped due to validation errors.`,
        );
      } else {
        this.showAlert(
          "Success",
          `Course "${courseName}" created with ${result.total_loaded} questions.`,
        );
      }

      // Reset form
      fileInput.value = "";
      fileInput.dispatchEvent(new Event("change"));

      // Refresh course list
      await this.showCourseSelection();
    } catch (error) {
      this.showError(
        "Failed to create course. Please check your JSON file format.",
      );
      console.error(error);
    }
  }

  private async handleDeleteCourse(courseId: string): Promise<void> {
    this.showConfirm(
      "Delete Course",
      "Are you sure you want to delete this course? This action cannot be undone.",
      async () => {
        await this.dataLayer.deleteCourse(courseId);
        await this.showCourseSelection();
      },
    );
  }

  private async handleEndSession(): Promise<void> {
    if (!this.state.currentCourseId) return;

    await this.dataLayer.logEvent(
      this.state.currentCourseId,
      "session_ended",
      {},
    );
    this.state.currentCourseId = null;
    await this.showCourseSelection();
  }

  private async handleNextQuestion(): Promise<void> {
    await this.showStudySession();
  }

  private async handleHideQuestion(): Promise<void> {
    if (!this.state.currentCourseId || !this.state.currentQuestion) return;

    await this.dataLayer.hideQuestion(
      this.state.currentCourseId,
      this.state.currentQuestion.state.question_id,
    );
    await this.showStudySession();
  }

  private async handleSaveNotes(): Promise<void> {
    if (!this.state.currentCourseId || !this.state.currentQuestion) return;

    const notesTextarea = document.getElementById(
      "notes-textarea",
    ) as HTMLTextAreaElement;
    await this.dataLayer.updateNotes(
      this.state.currentCourseId,
      this.state.currentQuestion.state.question_id,
      notesTextarea.value,
    );
    this.showAlert("Success", "Notes saved!");
  }

  private async handleWait(): Promise<void> {
    // Just refresh the view - next question might be available
    await this.showStudySession();
  }

  private async handleExitSession(): Promise<void> {
    await this.handleEndSession();
  }

  private async handleBackToCourses(): Promise<void> {
    await this.showCourseSelection();
  }

  private updateViewVisibility(): void {
    const views = [
      "course-selection",
      "study-session",
      "course-management",
      "expert-page",
    ];
    views.forEach((view) => {
      const el = document.getElementById(view);
      if (el) {
        el.classList.toggle("d-none", view !== this.state.currentView);
      }
    });
  }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new RepeatromApp();
});
