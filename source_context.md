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

| File | Description |
|------|-------------|
| `src/main.tsx` | React entry point. Renders App into DOM root with StrictMode. |
| `src/App.tsx` | Main router component. Maps screen type state to the corresponding screen component. |
| `src/context/AppContext.tsx` | Central React context. Manages navigation state, course list, database instance, and answer processing logic with pool transitions. |
| `src/data/data-layer.ts` | Abstract data layer. Defines all TypeScript interfaces (Question, Pool, Config, etc.), IDatabase interface, DataLayer wrapper, promotion/demotion thresholds, and snooze calculations. |
| `src/data/data-layer-indexdb.ts` | IndexedDB implementation of IDatabase. Handles persistent storage with 7 object stores, course validation, question selection algorithms, and indexed queries. |
| `src/screens/CourseListScreen.tsx` | Landing screen. Shows existing courses with stats, course creation form (JSON upload + name), and app info. |
| `src/screens/StudyScreen.tsx` | Main study interface. Loads next question, displays shuffled options, handles selection and submission. |
| `src/screens/FeedbackScreen.tsx` | Post-answer feedback. Shows correct/incorrect status, explanation, personal notes editor, auto-advance timer, and hide-question button. |
| `src/screens/NoQuestionsScreen.tsx` | Snooze timer screen. Displays countdown until the next question becomes available. |
| `src/screens/ExpertScreen.tsx` | Analytics dashboard. Two tabs showing questions grouped by pool and event logs (promotions, demotions, interactions). |
| `src/screens/CourseManageScreen.tsx` | Course management. Reset progress or delete course with confirmation dialogs. |
| `src/screens/ConfigScreen.tsx` | User settings. Toggle auto-advance on correct answers and configure delay timing. |
| `src/components/ConfirmDialog.tsx` | Reusable modal confirmation dialog with destructive action styling support. |