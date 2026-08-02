import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import * as db from './db';
import { applyBackup, backupFilename, buildBackup, dataUrlToBlob, parseBackup, BackupError } from './backup';
import { parseTrainingDays } from './parse';
import type { Session } from './types';

const FILE = 'Shoulder-bicep-tricep\nLeg-abs\nPecs-back';

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

describe('seedTrainings', () => {
  it('creates one training per line, in file order', async () => {
    const trainings = await db.seedTrainings(parseTrainingDays(FILE));
    expect(trainings.map((t) => t.id)).toEqual(['shoulder-bicep-tricep', 'leg-abs', 'pecs-back']);
    expect(trainings.every((t) => t.exerciseIds.length === 0)).toBe(true);
  });

  it('is idempotent', async () => {
    await db.seedTrainings(parseTrainingDays(FILE));
    const again = await db.seedTrainings(parseTrainingDays(FILE));
    expect(again).toHaveLength(3);
  });

  it('preserves exercises the user added when reseeding', async () => {
    await db.seedTrainings(parseTrainingDays(FILE));
    await db.putTraining({
      id: 'leg-abs',
      label: 'Leg-abs',
      order: 1,
      exerciseIds: ['0001', '0002'],
    });

    const reseeded = await db.seedTrainings(parseTrainingDays(FILE));
    expect(reseeded.find((t) => t.id === 'leg-abs')?.exerciseIds).toEqual(['0001', '0002']);
  });

  it('picks up a line added to the file', async () => {
    await db.seedTrainings(parseTrainingDays(FILE));
    const trainings = await db.seedTrainings(parseTrainingDays(`${FILE}\nCardio`));
    expect(trainings.map((t) => t.id)).toEqual([
      'shoulder-bicep-tricep',
      'leg-abs',
      'pecs-back',
      'cardio',
    ]);
  });

  it('reorders when the file order changes', async () => {
    await db.seedTrainings(parseTrainingDays(FILE));
    const trainings = await db.seedTrainings(parseTrainingDays('Pecs-back\nLeg-abs\nShoulder-bicep-tricep'));
    expect(trainings.map((t) => t.id)).toEqual(['pecs-back', 'leg-abs', 'shoulder-bicep-tricep']);
  });

  it('keeps a training whose line was deleted, ordered last', async () => {
    await db.seedTrainings(parseTrainingDays(FILE));
    await db.putTraining({ id: 'pecs-back', label: 'Pecs-back', order: 2, exerciseIds: ['0009'] });

    const trainings = await db.seedTrainings(parseTrainingDays('Shoulder-bicep-tricep\nLeg-abs'));
    expect(trainings.map((t) => t.id)).toEqual(['shoulder-bicep-tricep', 'leg-abs', 'pecs-back']);
    expect(trainings[2]?.exerciseIds).toEqual(['0009']);
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
    await db.seedTrainings(parseTrainingDays(FILE));
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
