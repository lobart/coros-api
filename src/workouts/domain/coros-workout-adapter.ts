import type { CorosWriteCapabilities } from './coros-write-capabilities';
import type {
  StructuredWorkout,
  StructuredWorkoutCreate,
  StructuredWorkoutUpdate,
  WorkoutSummary,
} from './structured-workout';

export interface CorosWorkoutAdapter {
  capabilitiesFor(accountId: string): Promise<CorosWriteCapabilities>;
  listWorkouts(accountId: string): Promise<WorkoutSummary[]>;
  getWorkout(accountId: string, workoutId: string): Promise<StructuredWorkout>;
  createWorkout(
    accountId: string,
    workout: StructuredWorkoutCreate,
    idempotencyKey?: string,
  ): Promise<StructuredWorkout>;
  updateWorkout(accountId: string, workoutId: string, workout: StructuredWorkoutUpdate): Promise<StructuredWorkout>;
  deleteWorkout(accountId: string, workoutId: string): Promise<void>;
  scheduleWorkout(
    accountId: string,
    workoutId: string,
    request: { scheduled_date: string; timezone: string },
  ): Promise<Record<string, unknown>>;
}
