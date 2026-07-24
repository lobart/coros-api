import type { CorosWriteCapabilities } from './coros-write-capabilities';
import type {
  StructuredWorkout,
  StructuredWorkoutCreate,
  StructuredWorkoutUpdate,
  WorkoutSummary,
} from './structured-workout';
import type {
  CorosWorkoutEstimate,
  WeekClipboard,
  WeekCopyRequest,
  WeekPasteRequest,
  WorkoutClipboard,
  WorkoutEstimateRequest,
  WorkoutPasteRequest,
} from './workout-transfer';

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
  replaceWorkout(accountId: string, workoutId: string, workout: StructuredWorkoutUpdate): Promise<StructuredWorkout>;
  copyWorkout(accountId: string, workoutId: string): Promise<WorkoutClipboard>;
  pasteWorkout(accountId: string, request: WorkoutPasteRequest, idempotencyKey?: string): Promise<StructuredWorkout>;
  copyWeek(accountId: string, request: WeekCopyRequest): Promise<WeekClipboard>;
  pasteWeek(accountId: string, request: WeekPasteRequest): Promise<Record<string, unknown>>;
  estimateWorkout(accountId: string, request: WorkoutEstimateRequest): Promise<CorosWorkoutEstimate>;
  getWorkoutLoad(accountId: string, workoutId: string): Promise<CorosWorkoutEstimate>;
  deleteWorkout(accountId: string, workoutId: string): Promise<void>;
  scheduleWorkout(
    accountId: string,
    workoutId: string,
    request: { scheduled_date: string; timezone: string },
  ): Promise<Record<string, unknown>>;
}
