import { z } from 'zod';

export const WorkoutSport = z.enum(['run', 'indoor_run', 'trail_run', 'bike', 'indoor_bike', 'pool_swim']);
export type WorkoutSport = z.infer<typeof WorkoutSport>;

export const WorkoutStepKind = z.enum(['warmup', 'work', 'recovery', 'cooldown', 'rest', 'repeat']);
export const WorkoutDurationType = z.enum(['time', 'distance', 'open']);
export const WorkoutTargetType = z.enum(['none', 'heart_rate', 'pace', 'effort_pace', 'power', 'cadence']);

export const WorkoutTarget = z
  .object({
    type: WorkoutTargetType,
    min: z.number().finite().positive().optional(),
    max: z.number().finite().positive().optional(),
    zone: z.number().int().min(1).max(6).optional(),
    unit: z.string().min(1).max(30).optional(),
  })
  .superRefine((value, context) => {
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
      context.addIssue({ code: 'custom', message: 'target.min must be <= target.max' });
    }
  });
export type WorkoutTarget = z.infer<typeof WorkoutTarget>;

export type WorkoutStep = {
  kind: z.infer<typeof WorkoutStepKind>;
  name?: string;
  durationType?: z.infer<typeof WorkoutDurationType>;
  durationValue?: number;
  target?: WorkoutTarget;
  repeatCount?: number;
  steps?: WorkoutStep[];
};

export const WorkoutStepSchema: z.ZodType<WorkoutStep> = z.lazy(() =>
  z
    .object({
      kind: WorkoutStepKind,
      name: z.string().min(1).max(120).optional(),
      durationType: WorkoutDurationType.optional(),
      durationValue: z.number().finite().positive().optional(),
      target: WorkoutTarget.optional(),
      repeatCount: z.number().int().min(2).max(100).optional(),
      steps: z.array(WorkoutStepSchema).min(1).max(50).optional(),
    })
    .superRefine((value, context) => {
      if (value.kind === 'repeat') {
        if (!value.repeatCount || !value.steps?.length) {
          context.addIssue({ code: 'custom', message: 'repeat requires repeatCount >= 2 and child steps' });
        }
        return;
      }
      if (value.steps || value.repeatCount) {
        context.addIssue({ code: 'custom', message: 'Only repeat steps may contain child steps' });
      }
      if (!value.durationType) {
        context.addIssue({ code: 'custom', message: 'Non-repeat step requires durationType' });
      }
      if (value.durationType !== 'open' && value.durationValue === undefined) {
        context.addIssue({ code: 'custom', message: 'Timed and distance steps require a positive durationValue' });
      }
      if (value.durationType === 'open' && value.durationValue !== undefined) {
        context.addIssue({ code: 'custom', message: 'Open step must not define durationValue' });
      }
    }),
);

const StructuredWorkoutFields = z.object({
  sport: WorkoutSport,
  name: z.string().trim().min(1).max(90),
  description: z.string().trim().max(500).optional(),
  steps: z.array(WorkoutStepSchema).min(1).max(50),
  expectedDurationSeconds: z.number().int().positive().optional(),
  externalSource: z.string().trim().min(1).max(50).optional(),
  externalWorkoutId: z.string().trim().min(1).max(200).optional(),
});

function validateWorkout(workout: z.infer<typeof StructuredWorkoutFields>, context: z.core.$RefinementCtx): void {
  const flattened = flattenSteps(workout.steps);
  if (flattened.length > 100) {
    context.addIssue({ code: 'custom', message: 'Workout may contain at most 100 effective steps' });
  }
  if (maxDepth(workout.steps) > 2) {
    context.addIssue({ code: 'custom', message: 'Repeat nesting depth may not exceed 2' });
  }
  for (const step of flattened) validateTargetForSport(workout.sport, step, context);
  if (workout.expectedDurationSeconds !== undefined) {
    const duration = workoutDurationSeconds(workout.steps);
    if (duration === null || duration !== workout.expectedDurationSeconds) {
      context.addIssue({
        code: 'custom',
        message: `Expected duration ${workout.expectedDurationSeconds}s does not match step duration ${duration ?? 'open'}s`,
      });
    }
  }
}

export const StructuredWorkoutCreate = StructuredWorkoutFields.superRefine(validateWorkout);
export type StructuredWorkoutCreate = z.infer<typeof StructuredWorkoutCreate>;

export const StructuredWorkoutUpdate = StructuredWorkoutFields.omit({
  externalSource: true,
  externalWorkoutId: true,
}).superRefine(validateWorkout);
export type StructuredWorkoutUpdate = z.infer<typeof StructuredWorkoutUpdate>;

export type StructuredWorkout = StructuredWorkoutCreate & {
  id: string;
  managedBy: 'external' | 'coros';
  replacesWorkoutId?: string;
  estimatedDurationSeconds?: number | null;
  estimatedDistanceMeters?: number | null;
  trainingLoad?: number | null;
};

export type WorkoutSummary = {
  id: string;
  name: string;
  sport: WorkoutSport;
  estimatedDurationSeconds: number | null;
  estimatedDistanceMeters: number | null;
  trainingLoad: number | null;
  managedBy: 'external' | 'coros';
};

export function workoutDurationSeconds(steps: WorkoutStep[]): number | null {
  let total = 0;
  for (const step of steps) {
    if (step.kind === 'repeat') {
      const nested = workoutDurationSeconds(step.steps ?? []);
      if (nested === null) return null;
      total += nested * (step.repeatCount ?? 0);
      continue;
    }
    if (step.durationType !== 'time') return null;
    total += step.durationValue ?? 0;
  }
  return total;
}

function flattenSteps(steps: WorkoutStep[]): WorkoutStep[] {
  return steps.flatMap((step) => (step.kind === 'repeat' ? flattenSteps(step.steps ?? []) : [step]));
}

function maxDepth(steps: WorkoutStep[], depth = 0): number {
  return Math.max(
    depth,
    ...steps.map((step) => (step.kind === 'repeat' ? maxDepth(step.steps ?? [], depth + 1) : depth)),
  );
}

function validateTargetForSport(sport: WorkoutSport, step: WorkoutStep, context: z.core.$RefinementCtx): void {
  const targetType = step.target?.type ?? 'none';
  const running = ['run', 'indoor_run', 'trail_run'].includes(sport);
  const cycling = ['bike', 'indoor_bike'].includes(sport);
  const swimming = sport === 'pool_swim';
  const allowed =
    targetType === 'none' ||
    targetType === 'heart_rate' ||
    (running && ['pace', 'effort_pace'].includes(targetType)) ||
    (cycling && ['power', 'cadence'].includes(targetType)) ||
    (swimming && targetType === 'pace');
  if (!allowed) context.addIssue({ code: 'custom', message: `${targetType} target is not supported for ${sport}` });
  if (step.durationType === 'distance' && !running && !cycling && !swimming) {
    context.addIssue({ code: 'custom', message: `Distance steps are not supported for ${sport}` });
  }
}
