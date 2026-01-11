# Active Next

A modern workout tracking app built with Expo, React Native, and TanStack Query.

## App Functionalities

### 🏋️ Workouts
- **Create workout templates** with multiple exercises, sets, reps, and weights
- **Edit and delete** existing workout templates
- **Start a workout** from any template to begin tracking

### 📅 Routines
- **Define weekly workout patterns** - assign workouts to specific days
- **Sequential mode** - workouts must be completed in order
- **Weekly completion mode** - complete workouts in any order within the week
- **Streak tracking** - maintains current and longest streak records

### ⏱️ Active Workout Session
- **Real-time timer** tracking total workout duration
- **Set-by-set logging** - mark sets complete as you go
- **Rest timer** with configurable default durations
- **Swipe to delete** sets during workout
- **Floating indicator** shows active workout from any screen

### 📊 Exercise Progression
- **Exercise library** with search functionality
- **Progression charts** showing 1RM and volume trends over time
- **Custom widgets** on dashboard for tracking specific exercises

### 📜 Workout History
- **Calendar view** with workout markers
- **Timeline list** grouped by week
- **Personal records** badges for 1RM and volume PRs

### ⚙️ Settings
- **Theme selection** (light/dark/system)
- **Rest timer defaults** customization
- **Body measurements** tracking (weight, height)
- **Timezone** configuration
- **Notification** preferences

## Tech Stack

- **Framework**: [Expo](https://expo.dev) 54 with Expo Router
- **UI**: [Tamagui](https://tamagui.dev) with custom theme
- **State Management**: [TanStack Query](https://tanstack.com/query) + [Zustand](https://zustand-demo.pmnd.rs/)
- **Forms**: [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Lists**: [@shopify/flash-list](https://shopify.github.io/flash-list/)
- **Auth**: WorkOS, Google Sign-In

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn
- iOS Simulator / Android Emulator (or physical device)

### Installation

```bash
# Install dependencies
yarn install

# Start development server
yarn start
```

### Running

```bash
# iOS
yarn ios

# Android
yarn android

# Web
yarn web
```

## Project Structure

```
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Main tab navigation
│   ├── workouts/          # Workout CRUD screens
│   └── legal/             # Legal pages
├── features/              # Feature modules
│   ├── workouts/          # Workout templates & management
│   ├── routines/          # Routine patterns & scheduling
│   ├── workout-session/   # Active workout tracking
│   ├── exercises/         # Exercise search & progression
│   ├── history/           # Workout history
│   ├── settings/          # User settings
│   ├── auth/              # Authentication
│   └── legal/             # Legal content
├── components/            # Shared UI components
├── lib/                   # Query keys, schemas, utilities
├── services/              # API service, notifications
├── stores/                # Zustand stores
├── types/                 # TypeScript types
└── utils/                 # Utility functions
```

## Scripts

| Command | Description |
|---------|-------------|
| `yarn start` | Start Expo dev server |
| `yarn ios` | Run on iOS simulator |
| `yarn android` | Run on Android emulator |
| `yarn web` | Start web server |
| `yarn format` | Format code with Prettier |
| `yarn test` | Run Jest tests |

## Architecture

### Data Fetching
All API data fetching uses TanStack Query with centralized query keys and Zod validation.

### Mutations
All mutations use `useMutation` with automatic cache invalidation.

### Feature Modules
Each feature exports via barrel files (`index.ts`) for clean imports:

```typescript
import { useWorkouts, useWorkoutMutations } from '../features/workouts'
import { useRoutines, useActiveRoutine } from '../features/routines'
```
