import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CorosConfigService } from '../coros/coros.config';

const Mapping = z.object({
  accountHash: z.string(),
  idempotencyKey: z.string(),
  externalSource: z.string(),
  externalWorkoutId: z.string(),
  workoutId: z.string(),
  contentHash: z.string(),
  managedBy: z.literal('external'),
  state: z.enum(['pending', 'confirmed']).default('confirmed'),
  createdAt: z.iso.datetime(),
  scheduledDate: z.string().optional(),
  idInPlan: z.string().optional(),
  planId: z.string().optional(),
  planProgramId: z.string().optional(),
});
export type WorkoutMapping = z.infer<typeof Mapping>;
const Mappings = z.array(Mapping);

@Injectable()
export class WorkoutMappingStore {
  private operation: Promise<void> = Promise.resolve();

  constructor(private readonly config: CorosConfigService) {}

  async find(accountId: string, idempotencyKey: string): Promise<WorkoutMapping | null> {
    const accountHash = this.accountHash(accountId);
    return (
      (await this.read()).find((item) => item.accountHash === accountHash && item.idempotencyKey === idempotencyKey) ??
      null
    );
  }

  async findByWorkout(accountId: string, workoutId: string): Promise<WorkoutMapping | null> {
    const accountHash = this.accountHash(accountId);
    return (await this.read()).find((item) => item.accountHash === accountHash && item.workoutId === workoutId) ?? null;
  }

  async save(mapping: Omit<WorkoutMapping, 'accountHash' | 'createdAt'> & { accountId: string }): Promise<void> {
    await this.serial(async () => {
      const rows = await this.read();
      const row: WorkoutMapping = {
        accountHash: this.accountHash(mapping.accountId),
        idempotencyKey: mapping.idempotencyKey,
        externalSource: mapping.externalSource,
        externalWorkoutId: mapping.externalWorkoutId,
        workoutId: mapping.workoutId,
        contentHash: mapping.contentHash,
        managedBy: 'external',
        state: mapping.state,
        createdAt: new Date().toISOString(),
      };
      const filtered = rows.filter(
        (item) => !(item.accountHash === row.accountHash && item.idempotencyKey === row.idempotencyKey),
      );
      filtered.push(row);
      await this.write(filtered);
    });
  }

  async delete(accountId: string, workoutId: string): Promise<void> {
    await this.serial(async () => {
      const accountHash = this.accountHash(accountId);
      await this.write(
        (await this.read()).filter((item) => !(item.accountHash === accountHash && item.workoutId === workoutId)),
      );
    });
  }

  async markScheduled(
    accountId: string,
    workoutId: string,
    values: Pick<WorkoutMapping, 'scheduledDate' | 'idInPlan' | 'planId' | 'planProgramId'>,
  ): Promise<void> {
    await this.serial(async () => {
      const rows = await this.read();
      const accountHash = this.accountHash(accountId);
      const row = rows.find((item) => item.accountHash === accountHash && item.workoutId === workoutId);
      if (!row) return;
      Object.assign(row, values);
      await this.write(rows);
    });
  }

  private async serial<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    let release!: () => void;
    this.operation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  private path(): string {
    return resolve(`${this.config.sessionStoragePath}.workout-mappings.json`);
  }

  private accountHash(accountId: string): string {
    return createHash('sha256').update(accountId).digest('hex');
  }

  private async read(): Promise<WorkoutMapping[]> {
    try {
      return Mappings.parse(JSON.parse(await readFile(this.path(), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(rows: WorkoutMapping[]): Promise<void> {
    const target = this.path();
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }
}
