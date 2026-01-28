/**
 * Test file for IndexedDBLayer
 * Comprehensive tests for the IndexedDB implementation of the data layer
 * Run with: bun run src/data/test-data-layer-indexdb.ts
 */

import { IndexedDBLayer } from "./data-layer-indexdb";
import type { Configuration } from "./data-layer";

// ============================================================================
// Test Helpers
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function log(message: string): void {
  console.log(`[TEST] ${message}`);
}

// ============================================================================
// Test Data
// ============================================================================

const sampleQuestions = [
  {
    question: "What is the capital of France?",
    options: ["Paris", "London", "Berlin", "Madrid"],
    correct_option: "Paris",
    explanation: "Paris is the capital and largest city of France.",
  },
  {
    question: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correct_option: "4",
    explanation: "2 + 2 equals 4.",
  },
  {
    question: "What is the largest planet in our solar system?",
    options: ["Earth", "Mars", "Jupiter", "Saturn"],
    correct_option: "Jupiter",
    explanation: "Jupiter is the largest planet in our solar system.",
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Au", "Ag", "Fe", "Cu"],
    correct_option: "Au",
    explanation: "Au comes from the Latin word 'aurum'.",
  },
  {
    question: "What is the square root of 16?",
    options: ["2", "3", "4", "5"],
    correct_option: "4",
    explanation: "4 squared equals 16.",
  },
  {
    question: "Who wrote Romeo and Juliet?",
    options: ["Shakespeare", "Dickens", "Austen", "Hemingway"],
    correct_option: "Shakespeare",
    explanation: "William Shakespeare wrote Romeo and Juliet.",
  },
  {
    question: "What is the speed of light?",
    options: [
      "299,792,458 m/s",
      "300,000,000 m/s",
      "150,000,000 m/s",
      "200,000,000 m/s",
    ],
    correct_option: "299,792,458 m/s",
    explanation:
      "The speed of light in vacuum is approximately 299,792,458 meters per second.",
  },
];

// ============================================================================
// Main Test Function
// ============================================================================

async function runTests(): Promise<void> {
  log("Starting IndexedDBLayer tests...");

  const db = new IndexedDBLayer();

  try {
    // ========================================================================
    // Test Initialization
    // ========================================================================

    log("Testing database initialization...");
    await db.initDatabase();
    const isInitialized = await db.isInitialized();
    assert(isInitialized, "Database should be initialized");
    log("✓ Database initialization passed");

    // ========================================================================
    // Test Course Creation and Management
    // ========================================================================

    log("Testing course creation...");
    const courseResult = await db.createCourse("Test Course", sampleQuestions);
    assert(courseResult.total_loaded > 0, "Should load questions");
    assert(courseResult.total_skipped === 0, "No questions should be skipped");
    assert(courseResult.validation_errors.length === 0, "No validation errors");
    const courseId = courseResult.course_id;
    assert(
      typeof courseId === "string" && courseId.length > 0,
      "Should generate course ID",
    );
    log(`✓ Course created with ID: ${courseId}`);

    log("Testing course listing...");
    const courses = await db.listCourses();
    assert(courses.length === 1, "Should list one course");
    assert(courses[0].id === courseId, "Course ID should match");
    assert(
      courses[0].question_count === sampleQuestions.length,
      "Question count should match",
    );
    assert(
      courses[0].latent_count === sampleQuestions.length,
      "All questions should be latent",
    );
    assert(courses[0].test_count === 0, "No test questions yet");
    log("✓ Course listing passed");

    log("Testing course stats...");
    const stats = await db.getCourseStats(courseId);
    assert(
      stats.question_count === sampleQuestions.length,
      "Stats should match",
    );
    log("✓ Course stats passed");

    // ========================================================================
    // Test Question Operations
    // ========================================================================

    log("Testing question retrieval...");
    const question1 = await db.getQuestion(courseId, 1);
    assert(question1 !== undefined, "Should retrieve question 1");
    assert(
      question1!.question === sampleQuestions[0].question,
      "Question text should match",
    );
    assert(
      question1!.correct_option === sampleQuestions[0].correct_option,
      "Correct answer should match",
    );
    const question99 = await db.getQuestion(courseId, 99);
    assert(
      question99 === undefined,
      "Should return undefined for non-existent question",
    );
    log("✓ Question retrieval passed");

    log("Testing question state updates...");
    await db.updateQuestionState(courseId, 1, { pool: "test" });
    await db.updateQuestionState(courseId, 2, {
      snooze_until: Date.now() + 1000,
    });
    await db.updateQuestionState(courseId, 3, { notes: "Test note" });
    log("✓ Question state updates passed");

    log("Testing question hiding...");
    await db.hideQuestion(courseId, 1);
    const availableTest = await db.getAvailableQuestions(courseId, "test");
    assert(
      availableTest.length === 0,
      "Hidden question should not be available",
    );
    log("✓ Question hiding passed");

    // ========================================================================
    // Test Interaction Operations
    // ========================================================================

    log("Testing interaction recording...");
    await db.recordInteraction(courseId, 2, "4", true, "random", "latent", 0);
    await db.recordInteraction(
      courseId,
      3,
      "Jupiter",
      true,
      "oldest",
      "test",
      0,
    );
    await db.recordInteraction(
      courseId,
      4,
      "Ag",
      false,
      "recovery",
      "learned",
      0,
    );
    log("✓ Interaction recording passed");

    log("Testing interaction history...");
    const history2 = await db.getQuestionHistory(courseId, 2);
    assert(history2.length === 1, "Should have one interaction for question 2");
    assert(history2[0].correct === true, "Interaction should be correct");
    assert(history2[0].answer_given === "4", "Answer should match");

    const history1 = await db.getQuestionHistory(courseId, 1);
    assert(history1.length === 0, "Should have no interactions for question 1");
    log("✓ Interaction history passed");

    // ========================================================================
    // Test Selection Algorithm
    // ========================================================================

    log("Testing question selection...");
    const nextQuestion = await db.findNextQuestion(courseId);
    assert(
      nextQuestion !== null,
      "Should select a question (latent promotion ensures availability)",
    );
    assert(nextQuestion!.question !== undefined, "Should have question data");
    assert(nextQuestion!.state !== undefined, "Should have state data");
    assert(typeof nextQuestion!.strategy === "string", "Should have strategy");

    log("Testing pool availability after latent promotion...");
    const availableLatent = await db.getAvailableQuestions(courseId, "latent");
    assert(
      availableLatent.length === 0,
      "Should have no latent questions available after promotion",
    );
    const availableTest2 = await db.getAvailableQuestions(courseId, "test");
    // Question 1 is hidden, question 3 is in test but may be snoozed or not
    log(
      `Available latent: ${availableLatent.length}, test: ${availableTest2.length}`,
    );
    log("✓ Question selection passed");

    // ========================================================================
    // Test Configuration
    // ========================================================================

    log("Testing configuration retrieval...");
    const config = await db.getConfig();
    assert(
      typeof config.test_pool_target_size === "number",
      "Should have test pool target",
    );
    assert(config.test_pool_target_size === 40, "Should have default value");
    log("✓ Configuration retrieval passed");

    log("Testing configuration updates...");
    const newConfig: Partial<Configuration> = { test_pool_target_size: 50 };
    await db.updateConfig(newConfig);
    const updatedConfig = await db.getConfig();
    assert(
      updatedConfig.test_pool_target_size === 50,
      "Should update configuration",
    );
    log("✓ Configuration updates passed");

    // ========================================================================
    // Test Logging
    // ========================================================================

    log("Testing event logging...");
    await db.logEvent(courseId, "session_started", { test: true });
    const logs = await db.getEventLog(courseId);
    assert(logs.length > 0, "Should have logged events");
    const latestLog = logs[0];
    assert(
      latestLog.type === "session_started",
      "Latest log should be session started",
    );
    log("✓ Event logging passed");

    // ========================================================================
    // Test Course Reset
    // ========================================================================

    log("Testing course reset...");
    await db.resetCourse(courseId);
    const resetStats = await db.getCourseStats(courseId);
    assert(
      resetStats.latent_count === resetStats.question_count,
      "All questions should be latent after reset",
    );
    assert(resetStats.test_count === 0, "No test questions after reset");
    log("✓ Course reset passed");

    // ========================================================================
    // Test Course Deletion
    // ========================================================================

    log("Testing course deletion...");
    await db.deleteCourse(courseId);
    const coursesAfterDelete = await db.listCourses();
    assert(
      coursesAfterDelete.length === 0,
      "No courses should remain after deletion",
    );
    log("✓ Course deletion passed");

    // ========================================================================
    // Test Cleanup
    // ========================================================================

    log("All tests passed successfully!");
  } catch (error) {
    log(`TEST FAILED: ${(error as Error).message}`);
    throw error;
  }
}

// Run the tests
runTests()
  .then(() => {
    log("Test suite completed successfully");
  })
  .catch((error) => {
    log(`Test suite failed: ${(error as Error).message}`);
    console.error(error);
  });
