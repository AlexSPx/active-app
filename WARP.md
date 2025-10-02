# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a React Native fitness tracking app built with Expo and Tamagui. The app allows users to create workout routines, track exercise sessions, and record workout history. It follows a client-server architecture with a backend API for data persistence.

## Essential Development Commands

### Development Workflow
```bash
# Start development server with cache clear
npm start

# Build and run on specific platforms  
npm run android
npm run ios
npm run web

# Code formatting and linting
npm run format          # Format all files with Prettier
npm run format:check    # Check formatting without changing files
npm run lint:fix        # Format code and show success message
```

### Testing
```bash
npm test  # Run Jest tests (currently configured but no test files present)
```

### Build Management (EAS)
```bash
# Development builds
npx eas build --profile development

# Preview builds (APK for Android)
npx eas build --profile preview-dev
npx eas build --profile preview-internal

# Production builds
npx eas build --profile production
```

### Tamagui Management
```bash
npm run upgrade:tamagui         # Update all Tamagui packages
npm run upgrade:tamagui:canary  # Update to canary versions
npm run check:tamagui           # Check Tamagui configuration
```

## Architecture Overview

### Core Technology Stack
- **React Native** (0.81.4) with **React 19.1.0**
- **Expo** (v54) for development and build tooling
- **Tamagui** for UI components and styling system
- **Expo Router** (v6) for navigation with typed routes
- **Zustand** for state management with persistence
- **React Native Reanimated** for animations
- **TypeScript** for type safety

### State Management Pattern
The app uses **Zustand** stores with persistence for different domains:
- `authStore` - Authentication state and user management
- `runningWorkoutStore` - Active workout session state
- `createWorkoutStore` - Workout creation flow state  
- `editWorkoutStore` - Workout editing state
- Additional UI stores for toasts and congratulations

### API Integration Layer
- `services/apiService.ts` - Centralized API client with token management
- `config/api.ts` - API endpoints and configuration
- `types/api.ts` - All API-related TypeScript types
- Automatic 401 handling triggers global logout

### Navigation Structure
Uses Expo Router with:
- File-based routing in `app/` directory
- Typed routes via `experiments.typedRoutes: true`
- Modal presentations and tab-based navigation
- AuthGuard component for route protection

## Key Patterns and Conventions

### Type Organization
- `types/api.ts` - API contracts and server types
- `types/workout.ts` - Internal app workout representation
- `types/workout-session.ts` - Active session types
- `types/history.ts` - Workout history display types
- Component prop types defined inline or nearby

### Custom Hooks Pattern
Located in `hooks/` directory, each hook handles specific domain logic:
- `useAuth*` - Authentication workflows
- `useWorkout*` - Workout CRUD operations and state
- `useExercise*` - Exercise search and management
- `useOptimizedTimer` - Performance-optimized workout timing

### API Configuration
Environment-based API configuration:
- Development: Uses `EXPO_PUBLIC_API_BASE_URL` from `.env.development`
- Production: Configurable via environment variables
- Token storage via AsyncStorage with automatic header injection

### Authentication Flow
1. `AuthContext` provides auth state via `authStore`
2. `AuthGuard` component handles route protection
3. Global 401 handler in API service triggers automatic logout
4. Persistent token storage with automatic restoration

## Project Structure Notes

### Component Organization
- `components/` - Reusable UI components
- `app/` - Route components using Expo Router
- Provider hierarchy: SafeArea → Portal → Tamagui → Toast → Auth

### Build Configuration
- **EAS Build** configured with multiple profiles
- **New Architecture** enabled for both iOS and Android
- **Tamagui** build optimizations with babel plugin
- **Metro** bundling with Expo configuration

### Code Style
- **Prettier** configuration with specific React Native settings
- **Biome** linting with custom rules (console.log as error)
- Line width: 90 characters (Biome), 100 characters (Prettier)
- Single quotes, no semicolons, ES5 trailing commas

## Environment Setup

### Required Environment Variables
```bash
EXPO_PUBLIC_API_BASE_URL=your_api_base_url
```

### Development Dependencies
The project requires Node.js and npm/yarn. All React Native dependencies are managed through Expo, eliminating native build tool requirements for development.

## Common Development Tasks

### Adding New API Endpoints
1. Update `config/api.ts` with new endpoint paths
2. Add TypeScript types to `types/api.ts`
3. Implement service method in `services/apiService.ts`
4. Create or update corresponding hooks in `hooks/`

### State Management Updates
1. Extend Zustand store interfaces and implementations
2. Update persistence configuration if needed
3. Add new hooks or update existing ones
4. Consider component impact and prop drilling

### UI Component Development
1. Use Tamagui components and design system
2. Follow existing component patterns in `components/`
3. Consider responsive design and dark/light theme support
4. Test across iOS, Android, and web platforms

### Workout Flow Modifications
The workout system has complex state involving:
- Template creation (`createWorkoutStore`)
- Active sessions (`runningWorkoutStore`) 
- Historical records (API-based)
- Exercise search and selection
Changes require careful consideration of the entire workflow.