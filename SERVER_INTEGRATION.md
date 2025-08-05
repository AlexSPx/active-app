# Server Integration Documentation

## Overview

This application now supports full server integration with configurable API endpoints for authentication and user data management.

## Configuration

### Environment Variables

Create a `.env.local` file (or `.env`) in the root directory:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

For production, set your production API URL:

```env
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

### API Endpoints

The application expects the following API endpoints:

#### Authentication

- **POST** `/api/auth/login`
  - Body: `{ email: string, password: string }`
  - Response: `{ token: string, user: User }`

#### User Data

- **GET** `/api/user/me`
  - Headers: `Authorization: Bearer <token>`
  - Response: `{ user: User }`

#### Exercise Search

- **GET** `/api/exercises/search?name={query}`
  - Headers: `Authorization: Bearer <token>` (optional, depending on your API design)
  - Query Parameters: `name` - The search term for exercise names
  - Response: `Array<ApiExercise>`

#### Workout Management

- **POST** `/api/workouts`
  - Headers: `Authorization: Bearer <token>`
  - Body: `CreateWorkoutRequest`
  - Response: `{ id: string }`

- **GET** `/api/workouts`
  - Headers: `Authorization: Bearer <token>`
  - Response: `Workout[]`
  - Features: Dynamic loading, pull-to-refresh, error handling, empty state

### Data Structures

#### User Data Structure

```typescript
interface User {
  id: string
  email: string
  name: string
  // Add other user properties as needed
}
```

#### Exercise Data Structure

```typescript
interface ApiExercise {
  id: string
  name: string
  level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'
  force: 'PULL' | 'PUSH' | 'STATIC'
  mechanic: 'COMPOUND' | 'ISOLATION'
  equipment:
    | 'BODY_ONLY'
    | 'MACHINE'
    | 'OTHER'
    | 'FOAM_ROLL'
    | 'KETTLEBELLS'
    | 'DUMBBELL'
    | 'CABLE'
    | 'BARBELL'
    | 'BANDS'
    | 'MEDICINE_BALL'
    | 'EXERCISE_BALL'
    | 'E_Z_CURL_BAR'
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category:
    | 'STRENGTH'
    | 'STRETCHING'
    | 'PLYOMETRICS'
    | 'STRONGMAN'
    | 'POWERLIFTING'
    | 'CARDIO'
    | 'OLYMPIC_WEIGHTLIFTING'
}
```

#### Workout Data Structures

```typescript
interface TemplateExercise {
  exerciseId: string
  // Strength training fields
  reps?: number[]
  weight?: number[]
  // Cardio/Time-based fields
  durationSeconds?: number[]
  // Common fields
  notes?: string
}

interface CreateWorkoutTemplateRequest {
  exercises: TemplateExercise[]
}

interface CreateWorkoutRequest {
  name: string
  notes?: string
  template: CreateWorkoutTemplateRequest
}
```

## Architecture

### API Service Layer

- **`config/api.ts`** - Configuration and endpoint definitions
- **`services/apiService.ts`** - API service class with methods for login, user data, exercise search, etc.

### Hooks and State Management

- **`stores/authStore.ts`** - Authentication state with persistence
- **`stores/userStore.ts`** - User data management with staleness checking
- **`hooks/useExerciseSearch.ts`** - Exercise search with API integration and debouncing

### Features

#### Token Management

- JWT tokens are automatically stored in AsyncStorage
- Tokens are included in all authenticated requests
- Auth state persists across app restarts

#### Error Handling

- Network errors are caught and displayed to users
- Expired tokens trigger automatic logout
- User-friendly error messages

#### Data Staleness

- User data is considered stale after 5 minutes
- Automatic refresh on app foreground
- Manual refresh capabilities

## Usage

### Login Flow

1. User enters credentials on login page
2. `authStore.login()` calls API service
3. On success, token is stored and user is authenticated
4. User data is fetched and stored
5. Navigation redirects to main app

### Demo Mode

For testing, the app includes demo credentials:

- Email: `alex@mail.com`
- Password: `password123`

Use the "Skip" button or demo social login for quick testing.

### Exercise Search Flow

1. User navigates to exercise search page
2. User types search query (debounced to 300ms)
3. `useExerciseSearch` hook calls API service
4. Results are displayed with real-time search using the API exercise format
5. User can select exercises to add to their workout
6. **Note**: The app now uses `ApiExercise` as the primary exercise type throughout the application

## Workout Management Features

### Dynamic Workout Fetching

The workouts page now fetches workout data dynamically from the server:

1. **Automatic Loading**: Workouts are fetched automatically when the page loads
2. **Pull-to-Refresh**: Users can refresh the workout list by pulling down
3. **Loading States**: Displays loading spinner during fetch operations
4. **Error Handling**: Shows error messages with retry functionality
5. **Empty State**: Displays helpful message when no workouts exist
6. **Type Conversion**: Seamlessly converts between API `Workout` and UI `WorkoutTemplate` types
7. **Compatibility**: Works with existing workout management and session systems

### Implementation Details

- **Hook**: `useWorkouts()` manages API calls, loading states, and error handling
- **Component Updates**: `WorkoutList` component supports both API and mock workout types
- **Conversion Layer**: Automatic conversion between server and UI data formats
- **Backward Compatibility**: Existing workout session functionality preserved

### Exercise Type Migration

The application has been updated to use the server-side exercise data structure (`ApiExercise`) as the primary exercise type instead of local mock types. This ensures consistency between the API and the application's internal data structures.

## Development

### Testing API Integration

1. Set up your backend server
2. Configure the API base URL in `.env.local`
3. Implement the required endpoints on your server
4. Test login flow with real credentials

### Debugging

- Check the terminal for API request logs
- Monitor AsyncStorage for token persistence
- Use the auth store devtools for state debugging

## Security Considerations

- Tokens are stored securely in AsyncStorage
- API requests use HTTPS in production
- Sensitive data is not logged in production builds
- Automatic token cleanup on logout
