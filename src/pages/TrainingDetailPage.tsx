/**
 * One training day — SPEC §5.3 (gym: its exercise list) and §5.8 (sport:
 * a log form and past logs). Same route, branching on `Training.kind`.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { BackButton } from '../components/BackButton';
import { ExerciseBrowser } from '../components/ExerciseBrowser';
import { ExerciseCard } from '../components/ExerciseCard';
import { PickRow } from '../components/PickRow';
import { Sheet, Toast } from '../components/Sheet';
import { ChevronRightIcon, GripIcon, PlusIcon } from '../components/icons';
import { useGym } from '../data/store';
import { formatDayWithWeekday, useLanguage } from '../data/i18n';
import { exerciseDisplayName } from '../data/exerciseI18n';
import { sportSessionSummary, snowConditionLabel, trainingKindLabel, weatherLabel } from '../data/sportLabels';
import { dayKey, parseLocalDate, trainingBadge } from '../data/derive';
import { useDragReorder } from '../hooks/useDragReorder';
import { useTransient } from '../hooks/useTransient';
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

export function TrainingDetailPage({ trainingId }: { trainingId: string }) {
  const { getTraining, exerciseById, addExerciseToTraining, removeExerciseFromTraining, reorderTrainingExercises, status } = useGym();
  const { t, language } = useLanguage();
  const [picking, setPicking] = useState(false);
  // The undo offer expires on its own; the removal is already persisted.
  const [undo, setUndo] = useTransient<string>(5000);

  const training = getTraining(trainingId);

  const [order, setOrder] = useState<string[]>(() => training?.exerciseIds ?? []);

  // Re-sync only when the id list itself changes (add/remove/reorder-commit) —
  // must not disturb an in-progress drag's local order otherwise.
  const idsKey = (training?.exerciseIds ?? []).join(',');
  useEffect(() => {
    setOrder(idsKey.split(',').filter(Boolean));
  }, [idsKey]);

  const exercises = useMemo(
    () => order.map((id) => exerciseById.get(id)).filter((ex): ex is Exercise => ex !== undefined),
    [order, exerciseById],
  );

  const drag = useDragReorder(order, setOrder, (next) => void reorderTrainingExercises(trainingId, next));
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
          <BackButton to="/trainings" label={t('trainings.title')} />
          <h1 className="page-title">{t('trainingDetail.notFoundTitle')}</h1>
          <div className="page-sub">{t('trainingDetail.notFoundBody')}</div>
        </div>
        <div className="section">
          <button className="btn btn-primary btn-block" onClick={() => navigate('/trainings')}>
            {t('trainingDetail.backToTrainings')}
          </button>
        </div>
      </div>
    );
  }

  if (training.kind && training.kind !== 'gym') {
    return <SportTrainingDetail training={training} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <BackButton to="/trainings" label={t('trainings.title')} />
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">
          {exercises.length} {t(exercises.length === 1 ? 'browser.exerciseOne' : 'browser.exerciseOther')}
        </div>
      </div>

      <div className="tr-detail-list">
        {exercises.map((exercise) => (
          <div key={exercise.id} ref={drag.setItemRef(exercise.id)} className={`tr-detail-row${drag.draggingId === exercise.id ? ' tr-card-dragging' : ''}`}>
            <button
              type="button"
              className="tr-card-grip"
              aria-label={t('trainings.reorderAria', { name: exerciseDisplayName(language, exercise.name) })}
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
      </div>

      <div className="tr-detail-actions">
        <button className="btn btn-tinted btn-block" onClick={() => setPicking(true)}>
          <PlusIcon />
          {t('exercises.addExercise')}
        </button>
      </div>

      {drag.ghost &&
        draggingExercise &&
        createPortal(
          <div className="tr-detail-row tr-detail-ghost" style={{ top: drag.ghost.top, left: drag.ghost.left, width: drag.ghost.width, height: drag.ghost.height }}>
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
            disabledIds={training.exerciseIds}
            renderItem={(exercise, { disabled }) => (
              <PickRow
                key={exercise.id}
                exercise={exercise}
                disabled={disabled}
                context="training"
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

  // Raw per-grade text, not numbers: a controlled numeric value re-renders as
  // "0" the instant the field is cleared, so the digit can never actually be
  // removed — the same reason distanceKm/elevationM/avgBpm above are strings.
  // Parsed to a count only at submit time.
  const [climbsByGrade, setClimbsByGrade] = useState<Record<ClimbGrade, string>>({ '3': '', '4': '', '5': '' });

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
      } else if (training.kind === 'climbing') {
        const count = (grade: ClimbGrade) => Math.max(0, Math.round(Number(climbsByGrade[grade]) || 0));
        input = { kind: 'climbing', date, climbsByGrade: { '3': count('3'), '4': count('4'), '5': count('5') } };
      } else {
        input = { kind: 'other', date, comments: comments.trim() };
      }
      await onSubmit(input);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('sportLog.couldNotSave'));
      setSaving(false);
    }
  }

  const commentsField = (id: string) => (
    <div className="field">
      <label className="label" htmlFor={id}>
        {t('sportLog.commentsLabel')}
      </label>
      <textarea id={id} className="input" rows={3} value={comments} placeholder={t('sportLog.commentsPlaceholder')} onChange={(e) => setComments(e.target.value)} />
    </div>
  );

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
      <form id={SPORT_LOG_FORM_ID} onSubmit={handleSubmit}>
        {error && (
          <div className="form-error field" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="sport-log-date">
            {t('sportLog.dateLabel')}
          </label>
          <input
            id="sport-log-date"
            className="input"
            type="date"
            required
            // No autoFocus: focusing a date input opens its native picker
            // immediately, before the sheet has finished appearing — the
            // picker then eats the next tap intended for a field further
            // down. The date already defaults to today.
            value={date}
            max={dayKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {training.kind === 'snowboard' && (
          <>
            <div className="field">
              <label className="label" htmlFor="sport-log-weather">
                {t('sportLog.weatherLabel')}
              </label>
              <select id="sport-log-weather" className="input" value={weather} onChange={(e) => setWeather(e.target.value as WeatherCondition)}>
                {WEATHER_CONDITIONS.map((w) => (
                  <option key={w} value={w}>
                    {weatherLabel(t, w)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="sport-log-snow">
                {t('sportLog.snowLabel')}
              </label>
              <select id="sport-log-snow" className="input" value={snowCondition} onChange={(e) => setSnowCondition(e.target.value as SnowCondition)}>
                {SNOW_CONDITIONS.map((s) => (
                  <option key={s} value={s}>
                    {snowConditionLabel(t, s)}
                  </option>
                ))}
              </select>
            </div>
            {commentsField('sport-log-comments')}
          </>
        )}

        {training.kind === 'cycling' && (
          <>
            <div className="field">
              <label className="label" htmlFor="sport-log-distance">
                {t('sportLog.distanceLabel')}
              </label>
              <input id="sport-log-distance" className="input" type="number" inputMode="decimal" min="0" step="0.1" required value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="sport-log-elevation">
                {t('sportLog.elevationLabel')}
              </label>
              <input id="sport-log-elevation" className="input" type="number" inputMode="numeric" min="0" step="1" value={elevationM} onChange={(e) => setElevationM(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="sport-log-bpm">
                {t('sportLog.bpmLabel')}
              </label>
              <input id="sport-log-bpm" className="input" type="number" inputMode="numeric" min="0" step="1" value={avgBpm} onChange={(e) => setAvgBpm(e.target.value)} />
            </div>
          </>
        )}

        {/* An 'other' training records nothing measurable — the training's own
            name says what the activity was, so the notes are the whole form. */}
        {training.kind === 'other' && commentsField('sport-log-other-comments')}

        {training.kind === 'climbing' && (
          <div className="field">
            <label className="label">{t('sportLog.climbsLabel')}</label>
            <div className="sportlog-grades">
              {CLIMB_GRADES.map((grade) => (
                <div className="sportlog-grade-row" key={grade}>
                  <span className="sportlog-grade-label">{t('stats.climbGradeLabel', { grade })}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input"
                    min="0"
                    step="1"
                    aria-label={t('sportLog.gradeCountAria', { grade })}
                    placeholder="0"
                    value={climbsByGrade[grade]}
                    onChange={(e) => setClimbsByGrade((c) => ({ ...c, [grade]: e.target.value }))}
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

function SportLogRow({ session, badge }: { session: SportSession; badge: string }) {
  const { t, locale } = useLanguage();

  return (
    <button className="history-row card-row" onClick={() => navigate(`/history/${session.id}`)}>
      <span className="history-row-badge" aria-hidden="true">
        {badge}
      </span>
      <span className="history-row-main">
        <span className="history-row-title">{formatDayWithWeekday(locale, parseLocalDate(session.date))}</span>
        <span className="history-row-summary">{sportSessionSummary(t, session)}</span>
      </span>
      <ChevronRightIcon className="history-row-chevron" />
    </button>
  );
}

function SportTrainingDetail({ training }: { training: Training }) {
  const { t } = useLanguage();
  const { sportSessions, logSportSession } = useGym();
  const [logging, setLogging] = useState(false);

  const logs = useMemo(
    () =>
      sportSessions
        .filter((s) => s.trainingId === training.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sportSessions, training.id],
  );
  const badge = trainingBadge(training);

  return (
    <div className="page">
      <div className="page-header">
        <BackButton to="/trainings" label={t('trainings.title')} />
        <h1 className="page-title">{training.label}</h1>
        <div className="page-sub">{trainingKindLabel(t, training.kind ?? 'gym')}</div>
      </div>

      <div className="tr-sport-log">
        <button className="btn btn-primary btn-block btn-lg" onClick={() => setLogging(true)}>
          <PlusIcon />
          {t('sportLog.logButton')}
        </button>
      </div>

      <section className="section">
        {logs.length === 0 ? (
          <div className="empty">{t('sportLog.noLogsYet')}</div>
        ) : (
          <div className="card">
            {logs.map((session) => (
              <SportLogRow key={session.id} session={session} badge={badge} />
            ))}
          </div>
        )}
      </section>

      {logging && <SportLogSheet training={training} onClose={() => setLogging(false)} onSubmit={(input) => logSportSession(training.id, input)} />}
    </div>
  );
}
