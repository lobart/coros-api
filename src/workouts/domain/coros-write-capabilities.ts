import type { WorkoutSport } from './structured-workout';

export type CorosWriteCapabilities = {
  createWorkout: boolean;
  updateWorkout: boolean;
  deleteWorkout: boolean;
  scheduleWorkout: boolean;
  unscheduleWorkout: boolean;
  createTrainingPlan: boolean;
  updateTrainingPlan: boolean;
  repeatBlocks: boolean;
  nestedRepeats: boolean;
  openSteps: boolean;
  paceTargets: boolean;
  heartRateTargets: boolean;
  powerTargets: boolean;
  cadenceTargets: boolean;
  supportedSports: WorkoutSport[];
  protocolVersion: string;
};
