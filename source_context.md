# Source Context

## About

RepeatRom is a browser-based spaced repetition flashcard app for mastering general knowledge through adaptive multiple-choice testing. Questions move through mastery pools (Latent → Test → Learned → Master) based on performance. Fully offline, no server needed — all data stored in IndexedDB.

## Tech Stack

- **Framework**: React 19, TypeScript 5.9
- **Styling**: Tailwind CSS 4
- **Build**: Vite 7, Bun (package manager)
- **Storage**: IndexedDB (browser-local, offline-first)
- **Linting**: ESLint 9, TypeScript ESLint

## Major Files

| File                                 | Description                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                       | React entry point. Renders App into DOM root with StrictMode.                                                                                                                          |
| `src/App.tsx`                        | Main router component. Maps screen type state to the corresponding screen component.                                                                                                   |
| `src/context/AppContext.tsx`         | Central React context. Manages navigation state, course list, database instance, and answer processing logic with pool transitions.                                                    |
| `src/data/data-layer.ts`             | Abstract data layer. Defines all TypeScript interfaces (Question, Pool, Config, etc.), IDatabase interface, DataLayer wrapper, promotion/demotion thresholds, and snooze calculations. |
| `src/data/data-layer-indexdb.ts`     | IndexedDB implementation of IDatabase. Handles persistent storage with 7 object stores, course validation, question selection algorithms, and indexed queries.                         |
| `src/screens/CourseListScreen.tsx`   | Landing screen. Shows existing courses with stats, course creation form (JSON upload + name), and app info.                                                                            |
| `src/screens/StudyScreen.tsx`        | Main study interface. Loads next question, displays shuffled options, handles selection and submission.                                                                                |
| `src/screens/FeedbackScreen.tsx`     | Post-answer feedback. Shows correct/incorrect status, explanation, personal notes editor, auto-advance timer, and hide-question button.                                                |
| `src/screens/NoQuestionsScreen.tsx`  | Snooze timer screen. Displays countdown until the next question becomes available.                                                                                                     |
| `src/screens/ExpertScreen.tsx`       | Analytics dashboard. Two tabs showing questions grouped by pool and event logs (promotions, demotions, interactions).                                                                  |
| `src/screens/CourseManageScreen.tsx` | Course management. Reset progress or delete course with confirmation dialogs.                                                                                                          |
| `src/screens/ConfigScreen.tsx`       | User settings. Toggle auto-advance on correct answers and configure delay timing.                                                                                                      |
| `src/components/ConfirmDialog.tsx`   | Reusable modal confirmation dialog with destructive action styling support.                                                                                                            |

## Algorithms

### Pool Selection (weighted random with penalty)

Selects which pool (test, learned, master) to draw the next question from. Each pool has a base weight (`pool_weight_test=12`, `pool_weight_learned=4`, `pool_weight_master=1`). If a pool has fewer available questions than `pool_penalty_threshold` (default 8), its effective weight is scaled down by `available / threshold`. A weighted random draw then picks the pool. Pools with zero available questions are excluded entirely.

**Implementation**: [data-layer-indexdb.ts:795-823](src/data/data-layer-indexdb.ts#L795-L823)

### Question Selection (strategy mix)

Once a pool is chosen, a question is selected using one of three strategies, chosen by random percentage thresholds:
- **Oldest** (`strategy_oldest_pct=30`): Picks the question with the oldest `last_shown` timestamp (or never-shown first).
- **Recovery** (`strategy_demoted_pct=30`): Picks the oldest question that has `was_demoted=true`. Falls back to random if no demoted questions exist.
- **Random** (remaining 40%): Picks a uniformly random question from the available pool.

**Implementation**: [data-layer-indexdb.ts:826-855](src/data/data-layer-indexdb.ts#L826-L855)

### Promotion / Demotion

Questions move through pools: **Latent → Test → Learned → Master**.

**Promotion** (on correct answer): After `promotion_consecutive_correct` (default 2) consecutive correct answers, a question promotes to the next pool (test→learned, learned→master). Consecutive correct count resets and `was_demoted` clears. When a question leaves the test pool, `refillTestPoolFromLatent` backfills from latent to maintain `test_pool_target_size` (default 40).

**Demotion** (on incorrect answer): After `demotion_incorrect_count` (default 1) consecutive incorrect answers, a question demotes one level (master→learned, learned→test). The `was_demoted` flag is set so the recovery strategy can prioritize it. Test pool questions cannot demote further.

**Latent→Test refill**: On each `findNextQuestion` call, if the test pool is below target size, latent questions are promoted in `question_id` order until the target is reached.

**Implementation**: [AppContext.tsx:85-227](src/context/AppContext.tsx#L85-L227) (answer processing), [data-layer-indexdb.ts:550-620](src/data/data-layer-indexdb.ts#L550-L620) (refill)
