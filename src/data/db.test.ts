import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import * as db from './db';
import { applyBackup, backupFilename, buildBackup, dataUrlToBlob, parseBackup, BackupError } from './backup';
import type { Session } from './types';

beforeEach(async () => {
  await db.closeDB();
  await deleteDB(db.DB_NAME);
});

function session(id: string, trainingId = 'leg-abs'): Session {
  return {
    id,
    trainingId,
    trainingLabel: 'Leg-abs',
    startedAt: '2026-08-01T10:00:00.000Z',
    savedAt: '2026-08-01T11:00:00.000Z',
    entries: [{ exerciseId: '0001', sets: [{ reps: 10, weight: 25, at: '2026-08-01T10:05:00.000Z' }] }],
  };
}

describe('createTraining', () => {
  it('appends a new training with no exercises, at the end of the rotation', async () => {
    const first = await db.createTraining('Push day');
    const second = await db.createTraining('Pull day');

    expect(first).toMatchObject({ label: 'Push day', order: 0, exerciseIds: [] });
    expect(second).toMatchObject({ label: 'Pull day', order: 1, exerciseIds: [] });
    expect(first.id).not.toBe(second.id);

    const trainings = await db.getTrainings();
    expect(trainings.map((t) => t.label)).toEqual(['Push day', 'Pull day']);
  });

  it('allows duplicate names — ids stay unique regardless', async () => {
    const a = await db.createTraining('Push day');
    const b = await db.createTraining('Push day');
    expect(a.id).not.toBe(b.id);
  });
});

describe('renameTraining', () => {
  it('changes the label without touching the id or order', async () => {
    const training = await db.createTraining('Push day');
    const renamed = await db.renameTraining(training.id, 'Upper body A');

    expect(renamed).toMatchObject({ id: training.id, label: 'Upper body A', order: 0 });
    expect((await db.getTrainings())[0]).toMatchObject({ id: training.id, label: 'Upper body A' });
  });

  it('preserves exerciseIds', async () => {
    const training = await db.createTraining('Push day');
    await db.putTraining({ ...training, exerciseIds: ['0001', '0002'] });

    const renamed = await db.renameTraining(training.id, 'Upper body A');
    expect(renamed?.exerciseIds).toEqual(['0001', '0002']);
  });

  it('returns null for an unknown id', async () => {
    expect(await db.renameTraining('nope', 'X')).toBeNull();
  });
});

describe('reorderTrainings', () => {
  it('applies a new order from a list of ids', async () => {
    const a = await db.createTraining('A');
    const b = await db.createTraining('B');
    const c = await db.createTraining('C');

    const trainings = await db.reorderTrainings([c.id, a.id, b.id]);
    expect(trainings.map((t) => t.label)).toEqual(['C', 'A', 'B']);
    expect(trainings.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('keeps a training missing from the given ids, appended at the end', async () => {
    const a = await db.createTraining('A');
    const b = await db.createTraining('B');

    const trainings = await db.reorderTrainings([b.id]);
    expect(trainings.map((t) => t.id)).toEqual([b.id, a.id]);
  });
});

describe('active session', () => {
  it('round-trips and clears', async () => {
    const active = {
      trainingId: 'leg-abs',
      trainingLabel: 'Leg-abs',
      startedAt: '2026-08-01T10:00:00.000Z',
      entries: [{ exerciseId: '0001', sets: [] }],
    };
    await db.putActiveSession(active);
    expect(await db.getActiveSession()).toEqual(active);

    await db.clearActiveSession();
    expect(await db.getActiveSession()).toBeNull();
  });

  it('holds only one at a time', async () => {
    const base = { trainingLabel: 'x', startedAt: '2026-08-01T10:00:00.000Z', entries: [] };
    await db.putActiveSession({ ...base, trainingId: 'a' });
    await db.putActiveSession({ ...base, trainingId: 'b' });
    expect((await db.getActiveSession())?.trainingId).toBe('b');
  });
});

describe('settings', () => {
  it('defaults when unset', async () => {
    expect(await db.getSettings()).toEqual({ weeklyGoal: 3, lastExportAt: null });
  });

  it('persists overrides', async () => {
    await db.putSetting('weeklyGoal', 5);
    await db.putSetting('lastExportAt', '2026-08-01T00:00:00.000Z');
    expect(await db.getSettings()).toEqual({
      weeklyGoal: 5,
      lastExportAt: '2026-08-01T00:00:00.000Z',
    });
  });
});

describe('backup round trip', () => {
  it('exports and restores everything, including a custom-exercise photo', async () => {
    await db.putTraining({ id: 'leg-abs', label: 'Leg-abs', order: 1, exerciseIds: ['0001'] });
    await db.putSession(session('s1'));
    await db.putSetting('weeklyGoal', 4);

    const photo = new Blob([new Uint8Array([1, 2, 3, 250, 251, 252])], { type: 'image/jpeg' });
    await db.putCustomExercise({
      id: 'c-1',
      name: 'Nordic curl',
      category: 'upper legs',
      equipment: 'body weight',
      target: 'hamstrings',
      imageBlob: photo,
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    const backup = await buildBackup();
    expect(backup.customExercises[0]?.image).toMatch(/^data:image\/jpeg;base64,/);

    // Survives serialisation to a file and back.
    const restored = parseBackup(JSON.stringify(backup));

    await db.clearAll();
    expect(await db.getSessions()).toEqual([]);

    await applyBackup(restored, 'replace');

    expect(await db.getSessions()).toEqual([session('s1')]);
    expect((await db.getTrainings()).find((t) => t.id === 'leg-abs')?.exerciseIds).toEqual(['0001']);
    expect(await db.getSettings()).toMatchObject({ weeklyGoal: 4 });

    const custom = (await db.getCustomExercises())[0];
    expect(custom?.name).toBe('Nordic curl');
    expect(new Uint8Array((await custom!.imageBlob!.arrayBuffer()))).toEqual(
      new Uint8Array([1, 2, 3, 250, 251, 252]),
    );
  });

  it('merge keeps existing records and lets the incoming file win on conflict', async () => {
    await db.putSession(session('existing'));
    await db.putSession({ ...session('shared'), trainingLabel: 'OLD' });

    const backup = parseBackup(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-08-01T00:00:00.000Z',
        trainings: [],
        sessions: [{ ...session('shared'), trainingLabel: 'NEW' }, session('incoming')],
        customExercises: [],
        settings: { weeklyGoal: 3, lastExportAt: null },
      }),
    );
    await applyBackup(backup, 'merge');

    const sessions = await db.getSessions();
    expect(sessions.map((s) => s.id).sort()).toEqual(['existing', 'incoming', 'shared']);
    expect(sessions.find((s) => s.id === 'shared')?.trainingLabel).toBe('NEW');
  });

  it('replace drops records absent from the backup', async () => {
    await db.putSession(session('gone'));

    const backup = parseBackup(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-08-01T00:00:00.000Z',
        trainings: [],
        sessions: [session('kept')],
        customExercises: [],
        settings: { weeklyGoal: 3, lastExportAt: null },
      }),
    );
    await applyBackup(backup, 'replace');

    expect((await db.getSessions()).map((s) => s.id)).toEqual(['kept']);
  });
});

describe('parseBackup validation', () => {
  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
  });

  it('rejects a JSON file that is not a backup', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/not an ander-gym backup/);
  });

  it('rejects a backup from a newer schema', () => {
    expect(() => parseBackup('{"schemaVersion":99,"trainings":[],"sessions":[]}')).toThrow(
      /newer version/,
    );
  });

  it('rejects a backup missing its core arrays', () => {
    expect(() => parseBackup('{"schemaVersion":1}')).toThrow(/missing its trainings/);
  });

  it('tolerates a missing customExercises array', () => {
    const parsed = parseBackup('{"schemaVersion":1,"trainings":[],"sessions":[]}');
    expect(parsed.customExercises).toEqual([]);
    expect(parsed.settings.weeklyGoal).toBe(3);
  });
});

describe('backup helpers', () => {
  it('names the file by date', () => {
    expect(backupFilename(new Date(2026, 7, 2))).toBe('ander-gym-2026-08-02.json');
  });

  it('decodes a data URL back to the original bytes', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,AQIDBA==');
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
