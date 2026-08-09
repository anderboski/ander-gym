import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { Sheet, Toast } from '../components/Sheet';
import { ChevronLeftIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../components/icons';
import { titleCase } from '../data/parse';
import { useGym } from '../data/store';
import { useLanguage } from '../data/i18n';
import { translateExerciseName, translateFacetValue } from '../data/exerciseI18n';
import { sportSessionSummary, snowConditionLabel, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import { dayKey, formatShortLocalDate } from '../data/derive';
import { useDragReorder } from '../hooks/useDragReorder';
import {
  CLIMB_GRADES,
  SNOW_CONDITIONS,
  WEATHER_CONDITIONS,
  type ClimbGrade,
  type Exercise,
  type NewSportSession,
  type SnowCondition,
  type SportSession,
  type Training,
  type WeatherCondition,
} from '../data/types';
import { navigate } from '../router';
import './TrainingsPage.css';
import './HistoryPage.css';

/** One row in the "add exercise" picker. */
function PickerRow({ exercise, onAdd }: { exercise: Exercise; onAdd: () => void }) {
  const { t, language } = useLanguage();
  const name = translateExerciseName(language, exercise.name);

  return (
    <button className="tr-pick" onClick={onAdd} aria-label={t('trainingDetail.addAria', { name })}>
      <span className="tr-pick-thumb">
        {exercise.imageUrl ? (
          <img src={exercise.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="tr-pick-main">
        <span className="tr-pick-name">{name}</span>
        <span className="tr-pick-meta">
          {titleCase(translateFacetValue(language, 'equipment', exercise.equipment))} ·{' '}
          {titleCase(translateFacetValue(language, 'target', exercise.target))}
        </span>
      </span>
      <span className="tr-pick-add" aria-hidden="true">
        <PlusIcon />
      </span>
    </button>
  );
}

export function TrainingDetailPage({ trainingId }: { trainingId: string }) {
  const {
    getTraining,
    getExercise,
    addExerciseToTraining,
    removeExerciseFromTraining,
    reorderTrainingExercises,
    status,
  } = useGym();
  const { t, language } = useLanguage();
  const [picking, setPicking] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);

  const training = getTraining(trainingId);

  // The undo offer expires on its own; the removal is already persisted.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const [order, setOrder] = useState<string[]>(() => training?.exerciseIds ?? []);

  // Re-sync only when the id list itself changes (add/remove/reorder-commit) —
  // must not disturb an in-progress drag's local order otherwise.
  const idsKey = (training?.exerciseIds ?? []).join(',');
  useEffect(() => {
    setOrder(idsKey.split(',').filter(Boolean));
  }, [idsKey]);

  const exerciseById = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const id of training?.exerciseIds ?? []) {
      const exercise = getExercise(id);
      if (exercise) map.set(id, exercise);
    }
    return map;
  }, [idsKey]);

  const drag = useDragReorder(
    order,
    setOrder,
    (next) => void reorderTrainingExercises(trainingId, next),
  );
  const draggingExercise = drag.draggingId ? exerciseById.get(drag.draggingId) : undefined;

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">{t('trainingDetail.notFoundTitle')}</h1>
        </div>
        <div className="empty">
          {t('trainingDetail.notFoundBody')}
          <div style={{ marginTop: 'var(--s4)' }}>
            <button className="btn" onClick={() => navigate('/trainings')}>
              {t('trainingDetail.backToTrainings')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (training.kind && training.kind !== 'gym') {
    return <SportTrainingDetail training={training} />;
  }

  const exercises = order
    .map((id) => exerciseById.get(id))
    .filter((ex): ex is Exercise => ex !== undefined);

  return (
    <div className="page">
      <button className="tr-back" onClick={() => navigate('/trainings')}>
        <ChevronLeftIcon />
        {t('trainings.title')}
      </button>

      <div className="page-header" style={{ paddingTop: 'var(--s2)' }}>
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">
          {exercises.length} {t(exercises.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </div>
      </div>

      <div className="tr-detail-list">
        {exercises.map((exercise) => (
          <div
            key={exercise.id}
            ref={drag.setItemRef(exercise.id)}
            className={`tr-detail-row${drag.draggingId === exercise.id ? ' tr-card-dragging' : ''}`}
          >
            <button
              type="button"
              className="tr-card-grip"
              aria-label={t('trainings.reorderAria', { name: translateExerciseName(language, exercise.name) })}
              onPointerDown={(e) => drag.onGripDown(exercise.id, e)}
              onPointerMove={drag.onGripMove}
              onPointerUp={drag.onGripUp}
              onPointerCancel={drag.onGripUp}
            >
              <GripIcon />
            </button>

            <div className="tr-detail-row-card">
              <ExerciseCard
                exercise={exercise}
                variant="block"
                onRemove={() => {
                  void removeExerciseFromTraining(training.id, exercise.id);
                  setUndo(exercise.id);
                }}
              />
            </div>
          </div>
        ))}

        <button className="tr-add-card" onClick={() => setPicking(true)}>
          <PlusIcon />
          {t('exercises.addExercise')}
        </button>
      </div>

      {drag.ghost &&
        draggingExercise &&
        createPortal(
          <div
            className="tr-detail-row tr-detail-ghost"
            style={{
              top: drag.ghost.top,
              left: drag.ghost.left,
              width: drag.ghost.width,
              height: drag.ghost.height,
            }}
          >
            <span className="tr-card-grip" aria-hidden="true">
              <GripIcon />
            </span>
            <div className="tr-detail-row-card">
              <ExerciseCard exercise={draggingExercise} variant="block" />
            </div>
          </div>,
          document.body,
        )}

      {picking && (
        <Sheet title={t('exercises.addExercise')} onClose={() => setPicking(false)} full>
          <ExerciseBrowser
            layout="list"
            excludeIds={training.exerciseIds}
            renderItem={(exercise) => (
              <PickerRow
                key={exercise.id}
                exercise={exercise}
                onAdd={() => {
                  void addExerciseToTraining(training.id, exercise.id);
                  setPicking(false);
                }}
              />
            )}
          />
        </Sheet>
      )}

      {undo && (
        <Toast
          message={t('trainingDetail.exerciseRemoved')}
          actionLabel={t('common.undo')}
          onAction={() => {
            void addExerciseToTraining(training.id, undo);
            setUndo(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sport trainings — log form + past logs, no exercises, no rotation           */
/* -------------------------------------------------------------------------- */

const SPORT_LOG_FORM_ID = 'sport-log-form';

function SportLogSheet({
  training,
  onClose,
  onSubmit,
}: {
  training: Training;
  onClose: () => void;
  onSubmit: (input: NewSportSession) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weather, setWeather] = useState<WeatherCondition>('sunny');
  const [snowCondition, setSnowCondition] = useState<SnowCondition>('powder');
  const [comments, setComments] = useState('');

  const [distanceKm, setDistanceKm] = useState('');
  const [elevationM, setElevationM] = useState('');
  const [avgBpm, setAvgBpm] = useState('');

  const [climbsByGrade, setClimbsByGrade] = useState<Record<ClimbGrade, number>>({ '3': 0, '4': 0, '5': 0 });

  const canSave = date.length > 0 && !saving && (training.kind !== 'cycling' || distanceKm.trim() !== '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      let input: NewSportSession;
      if (training.kind === 'snowboard') {
        input = { kind: 'snowboard', date, weather, snowCondition, comments: comments.trim() };
      } else if (training.kind === 'cycling') {
        input = {
          kind: 'cycling',
          date,
          distanceKm: Number(distanceKm) || 0,
          elevationM: Number(elevationM) || 0,
          avgBpm: avgBpm.trim() ? Number(avgBpm) : null,
        };
      } else {
        input = { kind: 'climbing', date, climbsByGrade };
      }
      await onSubmit(input);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sportLog.couldNotSave'));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={t('sportLog.formTitle', { training: training.label })}
      onClose={onClose}
      footer={
        <button type="submit" form={SPORT_LOG_FORM_ID} className="btn btn-primary btn-block" disabled={!canSave}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <form id={SPORT_LOG_FORM_ID} className="tr-name-form" onSubmit={handleSubmit}>
        {error && (
          <div className="tr-name-error" role="alert">
            {error}
          </div>
        )}

        <div className="tr-name-field">
          <label className="label" htmlFor="sport-log-date">
            {t('sportLog.dateLabel')}
          </label>
          <input
            id="sport-log-date"
            className="input"
            type="date"
            required
            autoFocus
            value={date}
            max={dayKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {training.kind === 'snowboard' && (
          <>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-weather">
                {t('sportLog.weatherLabel')}
              </label>
              <select
                id="sport-log-weather"
                className="input"
                value={weather}
                onChange={(e) => setWeather(e.target.value as WeatherCondition)}
              >
                {WEATHER_CONDITIONS.map((w) => (
                  <option key={w} value={w}>
                    {weatherLabel(t, w)}
                  </option>
                ))}
              </select>
            </div>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-snow">
                {t('sportLog.snowLabel')}
              </label>
              <select
                id="sport-log-snow"
                className="input"
                value={snowCondition}
                onChange={(e) => setSnowCondition(e.target.value as SnowCondition)}
              >
                {SNOW_CONDITIONS.map((s) => (
                  <option key={s} value={s}>
                    {snowConditionLabel(t, s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-comments">
                {t('sportLog.commentsLabel')}
              </label>
              <textarea
                id="sport-log-comments"
                className="input"
                rows={3}
                value={comments}
                placeholder={t('sportLog.commentsPlaceholder')}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
          </>
        )}

        {training.kind === 'cycling' && (
          <>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-distance">
                {t('sportLog.distanceLabel')}
              </label>
              <input
                id="sport-log-distance"
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                required
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </div>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-elevation">
                {t('sportLog.elevationLabel')}
              </label>
              <input
                id="sport-log-elevation"
                className="input"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={elevationM}
                onChange={(e) => setElevationM(e.target.value)}
              />
            </div>
            <div className="tr-name-field">
              <label className="label" htmlFor="sport-log-bpm">
                {t('sportLog.bpmLabel')}
              </label>
              <input
                id="sport-log-bpm"
                className="input"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={avgBpm}
                onChange={(e) => setAvgBpm(e.target.value)}
              />
            </div>
          </>
        )}

        {training.kind === 'climbing' && (
          <div className="tr-name-field">
            <label className="label">{t('sportLog.climbsLabel')}</label>
            <div className="sportlog-grades">
              {CLIMB_GRADES.map((grade) => (
                <div className="sportlog-grade-row" key={grade}>
                  <span className="sportlog-grade-label">{grade}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input"
                    min="0"
                    step="1"
                    aria-label={t('sportLog.gradeCountAria', { grade })}
                    value={climbsByGrade[grade]}
                    onChange={(e) => {
                      const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                      setClimbsByGrade((c) => ({ ...c, [grade]: n }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}

function SportLogRow({ session }: { session: SportSession }) {
  const { t } = useLanguage();

  return (
    <button className="card card-tappable history-row" onClick={() => navigate(`/history/${session.id}`)}>
      <span className="history-row-main">
        <span className="history-row-date num">{formatShortLocalDate(session.date)}</span>
        <span className="history-row-summary">{sportSessionSummary(t, session)}</span>
      </span>
      <span className="history-row-chevron" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

function SportTrainingDetail({ training }: { training: Training }) {
  const { t } = useLanguage();
  const { sportSessions, logSportSession, status } = useGym();
  const [logging, setLogging] = useState(false);

  const logs = useMemo(
    () =>
      sportSessions
        .filter((s) => s.trainingId === training.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sportSessions, training.id],
  );

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page">
      <button className="tr-back" onClick={() => navigate('/trainings')}>
        <ChevronLeftIcon />
        {t('trainings.title')}
      </button>

      <div className="page-header" style={{ paddingTop: 'var(--s2)' }}>
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">{trainingKindLabel(t, training.kind ?? 'gym')}</div>
      </div>

      <section className="section">
        <button className="btn btn-primary btn-block" onClick={() => setLogging(true)}>
          {t('sportLog.logButton')}
        </button>
      </section>

      <section className="section">
        {logs.length === 0 ? (
          <div className="empty">{t('sportLog.noLogsYet')}</div>
        ) : (
          <div className="history-list">
            {logs.map((session) => (
              <SportLogRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>

      {logging && (
        <SportLogSheet
          training={training}
          onClose={() => setLogging(false)}
          onSubmit={(input) => logSportSession(training.id, input)}
        />
      )}
    </div>
  );
}
