import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService } from '../coros/coros.config';
import { AccountLockService } from '../session/account-lock.service';
import type { CorosSession } from '../session/coros-session';
import { COROS_SESSION_STORE, type CorosSessionStore } from '../session/coros-session';
import { CorosWorkoutClient } from './coros-workout.client';
import type { CorosWorkoutAdapter } from './domain/coros-workout-adapter';
import type { CorosWriteCapabilities } from './domain/coros-write-capabilities';
import {
  type StructuredWorkout,
  StructuredWorkoutCreate,
  StructuredWorkoutUpdate,
  type WorkoutStep,
  type WorkoutSummary,
} from './domain/structured-workout';
import {
  type CorosWorkoutEstimate,
  type WeekClipboard,
  WeekCopyRequest,
  WeekPasteRequest,
  type WorkoutClipboard,
  WorkoutEstimateRequest,
  WorkoutPasteRequest,
} from './domain/workout-transfer';
import { CorosWorkoutMapper } from './mappers/coros-workout.mapper';
import { ProtocolCapabilitiesService } from './protocol-capabilities.service';
import { WorkoutAuditService } from './workout-audit.service';
import { type WorkoutMapping, WorkoutMappingStore } from './workout-mapping.store';

const ScheduleRequest = z.object({
  scheduled_date: z.iso.date(),
  timezone: z.string().min(1).max(100),
});
export type ScheduleRequest = z.infer<typeof ScheduleRequest>;

@Injectable()
export class CorosWorkoutService implements CorosWorkoutAdapter {
  constructor(
    private readonly config: CorosConfigService,
    private readonly client: CorosWorkoutClient,
    private readonly mapper: CorosWorkoutMapper,
    private readonly capabilities: ProtocolCapabilitiesService,
    private readonly mappings: WorkoutMappingStore,
    private readonly audit: WorkoutAuditService,
    private readonly locks: AccountLockService,
    @Inject(COROS_SESSION_STORE) private readonly sessions: CorosSessionStore,
  ) {}

  async capabilitiesFor(accountId: string): Promise<CorosWriteCapabilities> {
    const session = await this.requireSession(accountId);
    return await this.capabilities.forRegion(session.region);
  }

  async listWorkouts(accountId: string): Promise<WorkoutSummary[]> {
    await this.requireCapability(accountId, 'createWorkout');
    const rows = await this.client.request<Record<string, unknown>[]>(accountId, 'POST', '/training/program/query', {
      body: {},
    });
    return await Promise.all(rows.map(async (row) => await this.summary(accountId, row)));
  }

  async getWorkout(accountId: string, workoutId: string): Promise<StructuredWorkout> {
    return await this.getWorkoutUnlocked(accountId, workoutId);
  }

  private async getWorkoutUnlocked(accountId: string, workoutId: string): Promise<StructuredWorkout> {
    const rows = await this.rawWorkouts(accountId);
    const raw = rows.find((row) => String(row.id ?? '') === workoutId);
    if (!raw) throw new CorosIntegrationError(CorosErrorCode.workoutNotFound, 'Тренировка COROS не найдена.');
    return await this.fromProvider(accountId, raw);
  }

  async createWorkout(accountId: string, input: unknown, idempotencyKey?: string): Promise<StructuredWorkout> {
    this.ensureWriteEnabled();
    const capabilities = await this.requireCapability(accountId, 'createWorkout');
    const workout = this.parseCreate(input);
    this.ensureWorkoutCapabilities(workout, capabilities);
    const contentHash = this.hash(workout);
    const resolvedKey =
      idempotencyKey?.trim() ||
      this.hash({
        accountId,
        externalSource: workout.externalSource ?? 'unknown',
        externalWorkoutId: workout.externalWorkoutId ?? contentHash,
        contentHash,
      });
    const startedAt = new Date().toISOString();
    try {
      const created = await this.locks.runExclusive(
        accountId,
        async () => await this.createLocked(accountId, workout, resolvedKey, contentHash),
      );
      await this.auditSuccess('create', accountId, startedAt, created.id, contentHash, workout.externalWorkoutId);
      return created;
    } catch (error) {
      await this.auditFailure('create', accountId, startedAt, contentHash, error);
      throw error;
    }
  }

  async updateWorkout(accountId: string, _workoutId: string, _input: unknown): Promise<StructuredWorkout> {
    await this.requireCapability(accountId, 'updateWorkout');
    throw new CorosIntegrationError(
      CorosErrorCode.capabilityUnavailable,
      'COROS in-place update не подтверждён протоколом. Используйте replacement endpoint.',
    );
  }

  async replaceWorkout(accountId: string, workoutId: string, input: unknown): Promise<StructuredWorkout> {
    this.ensureWriteEnabled();
    const capabilities = await this.requireCapability(accountId, 'replaceWorkout');
    const workout = this.parseUpdate(input);
    this.ensureWorkoutCapabilities(workout, capabilities);
    const contentHash = this.hash(workout);
    const startedAt = new Date().toISOString();
    let replacementId: string | undefined;
    try {
      return await this.locks.runExclusive(accountId, async () => {
        const previous = await this.requireManagedMapping(accountId, workoutId);
        if (previous.scheduledDate) {
          throw new CorosIntegrationError(
            CorosErrorCode.capabilityUnavailable,
            'Замена назначенной тренировки недоступна без подтверждённого unschedule. Скопируйте и вставьте новую.',
          );
        }
        const replacement = {
          ...workout,
          externalSource: previous.externalSource,
          externalWorkoutId: previous.externalWorkoutId,
        };
        const replacementKey = `replace:${previous.idempotencyKey}:${contentHash}`;
        const created = await this.createLocked(accountId, replacement, replacementKey, contentHash);
        replacementId = created.id;
        const replacementMapping = await this.mappings.findByWorkout(accountId, created.id);
        if (!replacementMapping) {
          throw new CorosIntegrationError(
            CorosErrorCode.sessionConflict,
            'Не удалось закрепить mapping обновлённой тренировки.',
          );
        }
        await this.mappings.replace(accountId, workoutId, {
          ...replacementMapping,
          idempotencyKey: previous.idempotencyKey,
        });
        try {
          await this.client.request(accountId, 'POST', '/training/program/delete', {
            body: [workoutId],
            write: true,
            lock: false,
          });
        } catch (error) {
          await this.mappings.replace(accountId, created.id, {
            ...previous,
          });
          throw error;
        }
        await this.auditSuccess('replace', accountId, startedAt, created.id, contentHash, previous.externalWorkoutId);
        return { ...created, replacesWorkoutId: workoutId };
      });
    } catch (error) {
      if (replacementId) await this.cleanupReplacement(accountId, replacementId);
      await this.auditFailure('replace', accountId, startedAt, contentHash, error, workoutId);
      throw error;
    }
  }

  async deleteWorkout(accountId: string, workoutId: string): Promise<void> {
    this.ensureWriteEnabled();
    await this.requireCapability(accountId, 'deleteWorkout');
    const startedAt = new Date().toISOString();
    try {
      await this.locks.runExclusive(accountId, async () => {
        await this.requireManaged(accountId, workoutId);
        await this.client.request(accountId, 'POST', '/training/program/delete', {
          body: [workoutId],
          write: true,
          lock: false,
        });
        await this.mappings.delete(accountId, workoutId);
        await this.auditSuccess('delete', accountId, startedAt, workoutId, '', undefined);
      });
    } catch (error) {
      await this.auditFailure('delete', accountId, startedAt, '', error, workoutId);
      throw error;
    }
  }

  async scheduleWorkout(accountId: string, workoutId: string, input: unknown): Promise<Record<string, unknown>> {
    this.ensureWriteEnabled();
    await this.requireCapability(accountId, 'scheduleWorkout');
    await this.requireManaged(accountId, workoutId);
    const request = this.parseSchedule(input);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: request.timezone }).format(new Date());
    } catch {
      throw new CorosIntegrationError(CorosErrorCode.validationFailed, 'Некорректная timezone.');
    }
    const startedAt = new Date().toISOString();
    const fingerprint = this.hash({ workoutId, ...request });
    try {
      const result = await this.locks.runExclusive(
        accountId,
        async () => await this.scheduleLocked(accountId, workoutId, request),
      );
      await this.auditSuccess('schedule', accountId, startedAt, workoutId, fingerprint, undefined);
      return result;
    } catch (error) {
      await this.auditFailure('schedule', accountId, startedAt, fingerprint, error, workoutId);
      throw error;
    }
  }

  async copyWorkout(accountId: string, workoutId: string): Promise<WorkoutClipboard> {
    await this.requireCapability(accountId, 'copyWorkout');
    const mapping = await this.requireManagedMapping(accountId, workoutId);
    if (!mapping.workoutSnapshot) {
      throw new CorosIntegrationError(
        CorosErrorCode.capabilityUnavailable,
        'Точная структура старой тренировки недоступна для безопасного копирования.',
      );
    }
    const workout = mapping.workoutSnapshot;
    return {
      version: 1,
      copy_id: this.hash({ accountId, workoutId, workout, copiedAt: new Date().toISOString() }),
      source_workout_id: workoutId,
      workout,
      copied_at: new Date().toISOString(),
    };
  }

  async pasteWorkout(accountId: string, input: unknown, idempotencyKey?: string): Promise<StructuredWorkout> {
    const request = this.parseTransfer(WorkoutPasteRequest, input, 'Буфер тренировки не прошёл валидацию.');
    const workout = {
      ...request.clipboard.workout,
      name: request.name ?? request.clipboard.workout.name,
      externalSource: request.external_source,
      externalWorkoutId:
        request.external_workout_id ?? `copy:${request.clipboard.copy_id}:${request.clipboard.source_workout_id}`,
    };
    const created = await this.createWorkout(
      accountId,
      workout,
      idempotencyKey ??
        `paste:${request.clipboard.copy_id}:${request.external_workout_id ?? workout.name}:${request.scheduled_date ?? 'library'}`,
    );
    if (request.scheduled_date) {
      if (!request.timezone) {
        throw new CorosIntegrationError(
          CorosErrorCode.validationFailed,
          'timezone обязательна при вставке тренировки в календарь.',
        );
      }
      await this.scheduleWorkout(accountId, created.id, {
        scheduled_date: request.scheduled_date,
        timezone: request.timezone,
      });
    }
    return created;
  }

  async copyWeek(accountId: string, input: unknown): Promise<WeekClipboard> {
    await this.requireCapability(accountId, 'copyWeek');
    const request = this.parseTransfer(WeekCopyRequest, input, 'Параметры копирования недели некорректны.');
    this.assertTimezone(request.timezone);
    const end = this.addDays(request.source_week_start, 6);
    const mappings = await this.mappings.listScheduled(accountId, request.source_week_start, end);
    const sessions = mappings.map((mapping) => {
      if (!mapping.scheduledDate || !mapping.workoutSnapshot) {
        throw new CorosIntegrationError(
          CorosErrorCode.capabilityUnavailable,
          'Неделя содержит тренировку без точного локального snapshot.',
        );
      }
      return {
        day_offset: this.daysBetween(request.source_week_start, mapping.scheduledDate),
        source_date: mapping.scheduledDate,
        source_workout_id: mapping.workoutId,
        workout: mapping.workoutSnapshot,
      };
    });
    const copiedAt = new Date().toISOString();
    return {
      version: 1,
      copy_id: this.hash({ accountId, source: request.source_week_start, sessions, copiedAt }),
      source_week_start: request.source_week_start,
      timezone: request.timezone,
      sessions,
      copied_at: copiedAt,
    };
  }

  async pasteWeek(accountId: string, input: unknown): Promise<Record<string, unknown>> {
    this.ensureWriteEnabled();
    await this.requireCapability(accountId, 'copyWeek');
    const request = this.parseTransfer(WeekPasteRequest, input, 'Буфер недели или целевая дата некорректны.');
    this.assertTimezone(request.timezone);
    const targetEnd = this.addDays(request.target_week_start, 6);
    const occupied = new Set([
      ...this.scheduleDates(await this.queryScheduleRange(accountId, request.target_week_start, targetEnd)),
      ...(await this.mappings.listScheduled(accountId, request.target_week_start, targetEnd))
        .map((item) => item.scheduledDate)
        .filter((date): date is string => Boolean(date)),
    ]);
    const results: Record<string, unknown>[] = [];
    for (const session of request.clipboard.sessions) {
      const scheduledDate = this.addDays(request.target_week_start, session.day_offset);
      if (request.conflict_policy === 'skip_occupied_dates' && occupied.has(scheduledDate)) {
        results.push({
          source_workout_id: session.source_workout_id,
          scheduled_date: scheduledDate,
          status: 'skipped',
        });
        continue;
      }
      try {
        const created = await this.createWorkout(
          accountId,
          {
            ...session.workout,
            externalSource: 'week_copy',
            externalWorkoutId: `${request.clipboard.copy_id}:${session.day_offset}:${scheduledDate}`,
          },
          `week-paste:${request.clipboard.copy_id}:${session.day_offset}:${scheduledDate}`,
        );
        await this.scheduleWorkout(accountId, created.id, {
          scheduled_date: scheduledDate,
          timezone: request.timezone,
        });
        results.push({
          source_workout_id: session.source_workout_id,
          workout_id: created.id,
          scheduled_date: scheduledDate,
          status: 'scheduled',
        });
      } catch (error) {
        results.push({
          source_workout_id: session.source_workout_id,
          scheduled_date: scheduledDate,
          status: 'failed',
          error_code: error instanceof CorosIntegrationError ? error.code : CorosErrorCode.scheduleFailed,
        });
      }
    }
    const failed = results.filter((item) => item.status === 'failed').length;
    const skipped = results.filter((item) => item.status === 'skipped').length;
    return {
      status: failed ? 'partial' : 'completed',
      scheduled: results.length - failed - skipped,
      skipped,
      failed,
      sessions: results,
    };
  }

  async estimateWorkout(accountId: string, input: unknown): Promise<CorosWorkoutEstimate> {
    const capabilities = await this.requireCapability(accountId, 'estimateWorkout');
    const request = this.parseTransfer(WorkoutEstimateRequest, input, 'Запрос оценки тренировки некорректен.');
    this.ensureWorkoutCapabilities(request.workout, capabilities);
    if (
      request.requested_metric === 'duration' &&
      request.workout.steps.some((step) => step.durationType !== 'distance' && step.kind !== 'repeat')
    ) {
      throw new CorosIntegrationError(
        CorosErrorCode.validationFailed,
        'Оценка длительности требует тренировки, заданной расстоянием.',
      );
    }
    const program = this.mapper.toProgram(request.workout);
    const estimate = await this.client.request<Record<string, unknown>>(
      accountId,
      'POST',
      '/training/program/calculate',
      { body: program },
    );
    return this.normalizeEstimate(estimate, request.requested_metric);
  }

  async getWorkoutLoad(accountId: string, workoutId: string): Promise<CorosWorkoutEstimate> {
    await this.requireCapability(accountId, 'trainingLoad');
    const raw = (await this.rawWorkouts(accountId)).find((row) => String(row.id ?? '') === workoutId);
    if (!raw) throw new CorosIntegrationError(CorosErrorCode.workoutNotFound, 'Тренировка COROS не найдена.');
    const estimate = await this.client.request<Record<string, unknown>>(
      accountId,
      'POST',
      '/training/program/calculate',
      { body: raw },
    );
    return this.normalizeEstimate(estimate, 'both');
  }

  private async scheduleLocked(
    accountId: string,
    workoutId: string,
    request: ScheduleRequest,
  ): Promise<Record<string, unknown>> {
    const mapping = await this.mappings.findByWorkout(accountId, workoutId);
    if (mapping?.scheduledDate === request.scheduled_date) {
      return {
        workout_id: workoutId,
        scheduled_date: request.scheduled_date,
        status: 'already_scheduled',
      };
    }
    const raw = (await this.rawWorkouts(accountId)).find((row) => String(row.id ?? '') === workoutId);
    if (!raw) throw new CorosIntegrationError(CorosErrorCode.workoutNotFound, 'Тренировка COROS не найдена.');
    const compactDate = request.scheduled_date.replaceAll('-', '');
    const before = await this.querySchedule(accountId, compactDate);
    const idInPlan = Number(before.maxIdInPlan ?? 0) + 1;
    const program = { ...raw, idInPlan };
    const calculation = await this.client.request<Record<string, unknown>>(
      accountId,
      'POST',
      '/training/program/calculate',
      { body: program, write: true, lock: false },
    );
    this.applyCalculation(program, calculation);
    await this.client.request(accountId, 'POST', '/training/schedule/update', {
      body: {
        entities: [{ happenDay: compactDate, idInPlan, sortNo: 0, dayNo: 0, sortNoInPlan: 0, sortNoInSchedule: 0 }],
        programs: [program],
        versionObjects: [{ id: idInPlan, status: 1 }],
        pbVersion: 2,
      },
      write: true,
      lock: false,
    });
    const after = await this.querySchedule(accountId, compactDate);
    const resolved = this.findScheduleEntity(after, String(idInPlan));
    if (!resolved) {
      throw new CorosIntegrationError(
        CorosErrorCode.protocolChanged,
        'COROS не подтвердил назначение тренировки после write-запроса.',
      );
    }
    await this.mappings.markScheduled(accountId, workoutId, {
      scheduledDate: request.scheduled_date,
      idInPlan: String(idInPlan),
      planId: this.optionalString(after.id),
      planProgramId: this.optionalString(resolved?.planProgramId),
    });
    return {
      workout_id: workoutId,
      scheduled_date: request.scheduled_date,
      timezone: request.timezone,
      status: 'scheduled',
    };
  }

  private async createLocked(
    accountId: string,
    workout: z.infer<typeof StructuredWorkoutCreate>,
    idempotencyKey: string,
    contentHash: string,
  ): Promise<StructuredWorkout> {
    const existing = await this.mappings.find(accountId, idempotencyKey);
    if (existing) {
      if (existing.contentHash !== contentHash) {
        throw new CorosIntegrationError(
          CorosErrorCode.duplicateExternalWorkout,
          'Idempotency-Key уже использован с другим содержимым.',
        );
      }
      if (existing.state === 'pending') {
        throw new CorosIntegrationError(
          CorosErrorCode.sessionConflict,
          'Предыдущий create имеет неопределённый результат и требует reconciliation.',
        );
      }
      return await this.getWorkoutUnlocked(accountId, existing.workoutId);
    }
    const program = this.mapper.toProgram(workout);
    const calculation = await this.client.request<Record<string, unknown>>(
      accountId,
      'POST',
      '/training/program/calculate',
      { body: program, lock: false },
    );
    this.applyCalculation(program, calculation);
    await this.mappings.save({
      accountId,
      idempotencyKey,
      externalSource: workout.externalSource ?? 'external',
      externalWorkoutId: workout.externalWorkoutId ?? idempotencyKey,
      workoutId: `pending:${idempotencyKey}`,
      contentHash,
      managedBy: 'external',
      state: 'pending',
      workoutSnapshot: workout,
    });
    const data = await this.client.request<unknown>(accountId, 'POST', '/training/program/add', {
      body: program,
      write: true,
      lock: false,
    });
    const workoutId = this.providerId(data);
    await this.mappings.save({
      accountId,
      idempotencyKey,
      externalSource: workout.externalSource ?? 'external',
      externalWorkoutId: workout.externalWorkoutId ?? idempotencyKey,
      workoutId,
      contentHash,
      managedBy: 'external',
      state: 'confirmed',
      workoutSnapshot: workout,
    });
    return {
      ...workout,
      id: workoutId,
      managedBy: 'external',
      estimatedDurationSeconds: this.numberOrNull(program.estimatedTime ?? program.duration),
      estimatedDistanceMeters: this.distanceMeters(program.distance),
      trainingLoad: this.numberOrNull(program.trainingLoad),
    };
  }

  private async cleanupReplacement(accountId: string, workoutId: string): Promise<void> {
    try {
      await this.client.request(accountId, 'POST', '/training/program/delete', {
        body: [workoutId],
        write: true,
        lock: false,
      });
      await this.mappings.delete(accountId, workoutId);
    } catch {}
  }

  private parseCreate(input: unknown) {
    try {
      return StructuredWorkoutCreate.parse(input);
    } catch (error) {
      throw new CorosIntegrationError(
        CorosErrorCode.validationFailed,
        'Тренировка не прошла валидацию.',
        false,
        false,
        {
          cause: error,
        },
      );
    }
  }

  private parseUpdate(input: unknown) {
    try {
      return StructuredWorkoutUpdate.parse(input);
    } catch (error) {
      throw new CorosIntegrationError(
        CorosErrorCode.validationFailed,
        'Тренировка не прошла валидацию.',
        false,
        false,
        {
          cause: error,
        },
      );
    }
  }

  private parseSchedule(input: unknown): ScheduleRequest {
    try {
      return ScheduleRequest.parse(input);
    } catch (error) {
      throw new CorosIntegrationError(
        CorosErrorCode.validationFailed,
        'Дата или timezone не прошли валидацию.',
        false,
        false,
        {
          cause: error,
        },
      );
    }
  }

  private parseTransfer<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
    try {
      return schema.parse(input);
    } catch (error) {
      throw new CorosIntegrationError(CorosErrorCode.validationFailed, message, false, false, { cause: error });
    }
  }

  private async rawWorkouts(accountId: string): Promise<Record<string, unknown>[]> {
    await this.requireCapability(accountId, 'createWorkout');
    return await this.client.request<Record<string, unknown>[]>(accountId, 'POST', '/training/program/query', {
      body: {},
    });
  }

  private async querySchedule(accountId: string, compactDate: string): Promise<Record<string, unknown>> {
    return await this.client.request(accountId, 'GET', '/training/schedule/query', {
      query: { startDate: compactDate, endDate: compactDate, supportRestExercise: 1 },
    });
  }

  private async queryScheduleRange(accountId: string, startDate: string, endDate: string) {
    return await this.client.request<Record<string, unknown>>(accountId, 'GET', '/training/schedule/query', {
      query: {
        startDate: startDate.replaceAll('-', ''),
        endDate: endDate.replaceAll('-', ''),
        supportRestExercise: 1,
      },
    });
  }

  private async requireSession(accountId: string): Promise<CorosSession> {
    const session = await this.sessions.load(accountId);
    if (!session) {
      throw new CorosIntegrationError(
        CorosErrorCode.authRequired,
        'Спортсмен должен самостоятельно подключить COROS.',
        false,
        true,
      );
    }
    return session;
  }

  private async requireCapability(
    accountId: string,
    capability: keyof CorosWriteCapabilities,
  ): Promise<CorosWriteCapabilities> {
    const capabilities = await this.capabilitiesFor(accountId);
    if (capabilities[capability] !== true) {
      throw new CorosIntegrationError(
        CorosErrorCode.capabilityUnavailable,
        `COROS capability ${capability} не подтверждена sanitized fixture для этого региона.`,
      );
    }
    return capabilities;
  }

  private ensureWriteEnabled(): void {
    if (!this.config.writeApiEnabled) {
      throw new CorosIntegrationError(CorosErrorCode.writeDisabled, 'COROS_WRITE_API_ENABLED=false.');
    }
  }

  private async requireManaged(accountId: string, workoutId: string): Promise<void> {
    await this.requireManagedMapping(accountId, workoutId);
  }

  private async requireManagedMapping(accountId: string, workoutId: string): Promise<WorkoutMapping> {
    const mapping = await this.mappings.findByWorkout(accountId, workoutId);
    if (mapping?.state !== 'confirmed') {
      throw new CorosIntegrationError(
        CorosErrorCode.workoutDeleteFailed,
        'Операция разрешена только для тренировок, созданных внешним приложением.',
      );
    }
    return mapping;
  }

  private ensureWorkoutCapabilities(
    workout: z.infer<typeof StructuredWorkoutCreate> | z.infer<typeof StructuredWorkoutUpdate>,
    capabilities: CorosWriteCapabilities,
  ): void {
    if (!capabilities.supportedSports.includes(workout.sport)) {
      throw new CorosIntegrationError(
        CorosErrorCode.capabilityUnavailable,
        `COROS sport ${workout.sport} не подтверждён sanitized fixture для этого региона.`,
      );
    }
    const visit = (steps: WorkoutStep[], depth = 0): void => {
      for (const step of steps) {
        if (step.kind === 'repeat') {
          if (!capabilities.repeatBlocks) this.unsupportedShape('repeat blocks');
          if (depth > 0 && !capabilities.nestedRepeats) {
            this.unsupportedShape('nested repeats');
          }
          visit(step.steps ?? [], depth + 1);
        }
        if (step.durationType === 'open' && !capabilities.openSteps) this.unsupportedShape('open steps');
        const target = step.target?.type;
        if ((target === 'pace' || target === 'effort_pace') && !capabilities.paceTargets) {
          this.unsupportedShape('pace targets');
        }
        if (target === 'heart_rate' && !capabilities.heartRateTargets) {
          this.unsupportedShape('heart-rate targets');
        }
        if (target === 'power' && !capabilities.powerTargets) this.unsupportedShape('power targets');
        if (target === 'cadence' && !capabilities.cadenceTargets) this.unsupportedShape('cadence targets');
      }
    };
    visit(workout.steps);
  }

  private unsupportedShape(name: string): never {
    throw new CorosIntegrationError(
      CorosErrorCode.capabilityUnavailable,
      `COROS workout shape ${name} не подтверждён sanitized fixture для этого региона.`,
    );
  }

  private async summary(accountId: string, raw: Record<string, unknown>): Promise<WorkoutSummary> {
    const id = String(raw.id ?? '');
    const mapping = id ? await this.mappings.findByWorkout(accountId, id) : null;
    return {
      id,
      name: String(raw.name ?? 'COROS workout'),
      sport: this.sport(raw.sportType),
      estimatedDurationSeconds: this.numberOrNull(raw.estimatedTime ?? raw.duration),
      estimatedDistanceMeters: this.distanceMeters(raw.distance),
      trainingLoad: this.numberOrNull(raw.trainingLoad ?? raw.planTrainingLoad),
      managedBy: mapping ? 'external' : 'coros',
    };
  }

  private async fromProvider(accountId: string, raw: Record<string, unknown>): Promise<StructuredWorkout> {
    const summary = await this.summary(accountId, raw);
    const exercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    const steps: WorkoutStep[] = exercises
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !item.isGroup))
      .map((item) => ({
        kind: this.kind(item.exerciseType),
        name: typeof item.name === 'string' ? item.name : undefined,
        durationType: 'time',
        durationValue: Number(item.targetValue ?? 0),
        target: {
          type: this.targetType(item.intensityType),
          min: this.positiveNumber(item.intensityValue),
          max: this.positiveNumber(item.intensityValueExtend),
        },
      }));
    return {
      id: summary.id,
      sport: summary.sport,
      name: summary.name,
      description: typeof raw.overview === 'string' ? raw.overview : undefined,
      steps,
      managedBy: summary.managedBy,
      estimatedDurationSeconds: summary.estimatedDurationSeconds,
      estimatedDistanceMeters: summary.estimatedDistanceMeters,
      trainingLoad: summary.trainingLoad,
    };
  }

  private sport(value: unknown): StructuredWorkout['sport'] {
    const sport = Number(value);
    if (sport === 1) return 'run';
    if (sport === 2 || sport === 201) return 'indoor_bike';
    if (sport === 200) return 'bike';
    if (sport === 3) return 'pool_swim';
    return 'run';
  }

  private kind(value: unknown): WorkoutStep['kind'] {
    return (
      ({ 1: 'warmup', 2: 'work', 3: 'cooldown', 4: 'recovery' } as Record<number, WorkoutStep['kind']>)[
        Number(value)
      ] ?? 'work'
    );
  }

  private targetType(value: unknown): NonNullable<WorkoutStep['target']>['type'] {
    return (
      ({ 2: 'heart_rate', 3: 'pace', 6: 'power', 7: 'cadence' } as const)[Number(value) as 2 | 3 | 6 | 7] ?? 'none'
    );
  }

  private providerId(data: unknown): string {
    if (typeof data === 'string' || typeof data === 'number') return String(data);
    if (data && typeof data === 'object') {
      const id = (data as Record<string, unknown>).id;
      if (typeof id === 'string' || typeof id === 'number') return String(id);
    }
    throw new CorosIntegrationError(CorosErrorCode.protocolChanged, 'COROS create response не содержит workout ID.');
  }

  private applyCalculation(program: Record<string, unknown>, calculation: Record<string, unknown>): void {
    const mapping = {
      planDuration: 'duration',
      planTrainingLoad: 'trainingLoad',
      planDistance: 'distance',
      planSets: 'sets',
      exerciseBarChart: 'exerciseBarChart',
    } as const;
    for (const [source, target] of Object.entries(mapping)) {
      if (source in calculation) program[target] = calculation[source];
    }
  }

  private findScheduleEntity(schedule: Record<string, unknown>, idInPlan: string): Record<string, unknown> | null {
    const pending: unknown[] = [schedule];
    while (pending.length) {
      const value = pending.pop();
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === 'object') {
        const row = value as Record<string, unknown>;
        if (String(row.idInPlan ?? '') === idInPlan) return row;
        pending.push(...Object.values(row));
      }
    }
    return null;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private distanceMeters(value: unknown): number | null {
    const centimeters = this.numberOrNull(value);
    return centimeters === null ? null : centimeters / 100;
  }

  private normalizeEstimate(
    data: Record<string, unknown>,
    requestedMetric: CorosWorkoutEstimate['requestedMetric'],
  ): CorosWorkoutEstimate {
    const daily = data.currentDaySum;
    const currentDay =
      daily && typeof daily === 'object' && !Array.isArray(daily) ? (daily as Record<string, unknown>) : null;
    return {
      requestedMetric,
      durationSeconds: this.numberOrNull(data.planDuration ?? data.duration),
      distanceMeters: this.distanceMeters(data.planDistance ?? data.distance),
      trainingLoad: this.numberOrNull(data.planTrainingLoad ?? data.trainingLoad),
      sets: this.numberOrNull(data.planSets ?? data.sets),
      pitch: this.numberOrNull(data.planPitch ?? data.pitch),
      elevationGainMeters: this.numberOrNull(data.planElevGain ?? data.actualElevGain),
      dailyLoad: currentDay
        ? {
            acuteTrainingLoad: this.numberOrNull(currentDay.planAti),
            chronicTrainingLoad: this.numberOrNull(currentDay.planCti),
            tiredRate: this.numberOrNull(currentDay.planTiredRate),
            tiredRateNew: this.numberOrNull(currentDay.planTiredRateNew),
            trainingLoad: this.numberOrNull(currentDay.planTrainingLoad),
          }
        : null,
    };
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new CorosIntegrationError(CorosErrorCode.validationFailed, 'Некорректная timezone.');
    }
  }

  private addDays(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private daysBetween(start: string, end: string): number {
    return Math.round(
      (new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) / 86_400_000,
    );
  }

  private scheduleDates(schedule: Record<string, unknown>): string[] {
    const dates = new Set<string>();
    const pending: unknown[] = [schedule];
    while (pending.length) {
      const value = pending.pop();
      if (Array.isArray(value)) {
        pending.push(...value);
      } else if (value && typeof value === 'object') {
        const row = value as Record<string, unknown>;
        const raw = row.happenDay;
        if (typeof raw === 'string' && /^\d{8}$/.test(raw)) {
          dates.add(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
        }
        pending.push(...Object.values(row));
      }
    }
    return [...dates];
  }

  private positiveNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    return value === null || value === undefined || value === '' ? undefined : String(value);
  }

  private async auditSuccess(
    operation: string,
    accountId: string,
    startedAt: string,
    workoutId: string,
    fingerprint: string,
    externalWorkoutId?: string,
  ): Promise<void> {
    await this.audit.record({
      operation,
      accountId,
      externalWorkoutId,
      corosWorkoutId: workoutId,
      requestFingerprint: fingerprint,
      protocolVersion: 'training-hub-web-v1',
      startedAt,
      completedAt: new Date().toISOString(),
      result: 'success',
    });
  }

  private async auditFailure(
    operation: string,
    accountId: string,
    startedAt: string,
    fingerprint: string,
    error: unknown,
    workoutId?: string,
  ): Promise<void> {
    await this.audit.record({
      operation,
      accountId,
      corosWorkoutId: workoutId,
      requestFingerprint: fingerprint,
      protocolVersion: 'training-hub-web-v1',
      startedAt,
      completedAt: new Date().toISOString(),
      result: 'failed',
      errorCode: error instanceof CorosIntegrationError ? error.code : 'COROS_UNKNOWN_ERROR',
    });
  }
}
