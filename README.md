# repeatrom

A spaced repetition flashcard system for mastering general knowledge through adaptive multiple-choice question testing.

#### Demo

- [Basic German](https://charstorm.github.io/repeatrom/?course_name=German+Basics&course_path=courses%2Fgerman%2Fbasic_german_300.json)
- [Probability and Statistics](https://charstorm.github.io/repeatrom/?course_name=Basic+Stats&course_path=courses%2Fstats%2Fstats_basic.json)

Note: Both use LLM generated course materials. You can find them under `data/courses`.

## Overview

Repeatrom uses a two-tier adaptive selection algorithm to present questions at appropriate difficulty levels based on demonstrated competence. Questions move through four mastery pools — Latent, Test, Learned, and Master — with automatic promotion and demotion based on consecutive correct or incorrect answers.

Key features:

- **Adaptive learning** — question difficulty adjusts based on performance
- **Spaced repetition** — strategic timing prevents cramming and premature forgetting
- **General purpose** — works for any subject expressible as multiple-choice questions
- **Offline-capable** — data stored locally in IndexedDB

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4
- **Build tooling:** Vite 7
- **Runtime:** Bun
- **Storage:** IndexedDB (browser-local)

## Prerequisites

- [Bun](https://bun.sh/) installed

## Getting Started

Install dependencies:

```sh
bun install
```

Start the development server:

```sh
bun run dev
```

Build for production:

```sh
bun run build
```

Preview the production build:

```sh
bun run preview
```

Lint the codebase:

```sh
bun run lint
```

## Project Structure

```
src/
  components/   # Reusable UI components
  screens/      # Page-level screen components
  context/      # React context providers
  data/         # Data layer and IndexedDB implementation
  assets/       # Static assets
```
