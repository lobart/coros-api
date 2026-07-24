import { z } from 'zod';
import { StructuredWorkoutCreate } from './structured-workout';

export const WorkoutClipboard = z.object({
  version: z.literal(1),
  copy_id: z.string().min(1),
  source_workout_id: z.string().min(1),
  workout: StructuredWorkoutCreate,
  copied_at: z.iso.datetime(),
});
export type WorkoutClipboard = z.infer<typeof WorkoutClipboard>;

export const WorkoutPasteRequest = z.object({
  clipboard: WorkoutClipboard,
  name: z.string().trim().min(1).max(90).optional(),
  external_source: z.string().trim().min(1).max(50).default('external'),
  external_workout_id: z.string().trim().min(1).max(200).optional(),
  scheduled_date: z.iso.date().optional(),
  timezone: z.string().min(1).max(100).optional(),
});
export type WorkoutPasteRequest = z.infer<typeof WorkoutPasteRequest>;

export const WeekClipboardSession = z.object({
  day_offset: z.number().int().min(0).max(6),
  source_date: z.iso.date(),
  source_workout_id: z.string().min(1),
  workout: StructuredWorkoutCreate,
});

export const WeekClipboard = z.object({
  version: z.literal(1),
  copy_id: z.string().min(1),
  source_week_start: z.iso.date(),
  timezone: z.string().min(1).max(100),
  sessions: z.array(WeekClipboardSession).max(100),
  copied_at: z.iso.datetime(),
});
export type WeekClipboard = z.infer<typeof WeekClipboard>;

const Monday = z.iso.date().refine((value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1, {
  message: 'week start must be Monday',
});

export const WeekCopyRequest = z.object({
  source_week_start: Monday,
  timezone: z.string().min(1).max(100),
});
export type WeekCopyRequest = z.infer<typeof WeekCopyRequest>;

export const WeekPasteRequest = z.object({
  clipboard: WeekClipboard,
  target_week_start: Monday,
  timezone: z.string().min(1).max(100),
  conflict_policy: z.enum(['append', 'skip_occupied_dates']).default('append'),
});
export type WeekPasteRequest = z.infer<typeof WeekPasteRequest>;

export const WorkoutEstimateRequest = z.object({
  workout: StructuredWorkoutCreate,
  requested_metric: z.enum(['distance', 'duration', 'both']).default('both'),
});
export type WorkoutEstimateRequest = z.infer<typeof WorkoutEstimateRequest>;

export type CorosWorkoutEstimate = {
  requestedMetric: WorkoutEstimateRequest['requested_metric'];
  durationSeconds: number | null;
  distanceMeters: number | null;
  trainingLoad: number | null;
  sets: number | null;
  pitch: number | null;
  elevationGainMeters: number | null;
  dailyLoad: {
    acuteTrainingLoad: number | null;
    chronicTrainingLoad: number | null;
    tiredRate: number | null;
    tiredRateNew: number | null;
    trainingLoad: number | null;
  } | null;
};
