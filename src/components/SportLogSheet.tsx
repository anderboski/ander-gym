/**
 * The one-shot sport log form — SPEC §5.8. Opened from a sport training's
 * detail view, and from an empty day on Home's calendar (§5.1) with that day
 * preset.
 */
import { useState, type FormEvent } from 'react';
import { Sheet } from './Sheet';
import { useLanguage } from '../data/i18n';
import { snowConditionLabel, weatherLabel } from '../data/sportLabels';
import { dayKey } from '../data/derive';
import { parseDecimal } from '../data/parse';
import {
  CLIMB_GRADES,
  SNOW_CONDITIONS,
  WEATHER_CONDITIONS,
  type ClimbGrade,
  type NewSportSession,
  type SnowCondition,
  type Training,
  type WeatherCondition,
} from '../data/types';
import './SportLogSheet.css';

const SPORT_LOG_FORM_ID = 'sport-log-form';

export function SportLogSheet({
  training,
  initialDate,
  onClose,
  onSubmit,
}: {
  training: Training;
  /** `YYYY-MM-DD`, at most today. Defaults to today; Home's calendar presets the day that was tapped. */
  initialDate?: string;
  onClose: () => void;
  onSubmit: (input: NewSportSession) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState(() => initialDate ?? dayKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weather, setWeather] = useState<WeatherCondition>('sunny');
  const [snowCondition, setSnowCondition] = useState<SnowCondition>('powder');
  const [comments, setComments] = useState('');

  const [distanceKm, setDistanceKm] = useState('');
  const [elevationM, setElevationM] = useState('');
  const [avgBpm, setAvgBpm] = useState('');
  const [durationMin, setDurationMin] = useState('');

  // Raw per-grade text, not numbers: a controlled numeric value re-renders as
  // "0" the instant the field is cleared, so the digit can never actually be
  // removed — the same reason distanceKm/elevationM/avgBpm above are strings.
  // Parsed to a count only at submit time.
  const [climbsByGrade, setClimbsByGrade] = useState<Record<ClimbGrade, string>>({ '3': '', '4': '', '5': '' });

  const distanceValue = parseDecimal(distanceKm);
  const durationValue = parseDecimal(durationMin);
  const canSave = date.length > 0 && !saving && (training.kind !== 'cycling' || distanceValue !== null) &&
    // Pace is time over distance, so a run missing either would poison the average.
    (training.kind !== 'running' || (distanceValue !== null && durationValue !== null));

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
          distanceKm: distanceValue ?? 0,
          elevationM: Number(elevationM) || 0,
          avgBpm: avgBpm.trim() ? Number(avgBpm) : null,
        };
      } else if (training.kind === 'running') {
        input = {
          kind: 'running',
          date,
          distanceKm: distanceValue ?? 0,
          durationMin: durationValue ?? 0,
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
            // down. The date is already filled in.
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

        {(training.kind === 'cycling' || training.kind === 'running') && (
          <>
            {/* Distance and time are text, not type="number": see parseDecimal for
                why a number input loses "12,5" and rejects a second decimal. */}
            <div className="field">
              <label className="label" htmlFor="sport-log-distance">
                {t('sportLog.distanceLabel')}
              </label>
              <input id="sport-log-distance" className="input" type="text" inputMode="decimal" autoComplete="off" required value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
            </div>
            {training.kind === 'running' && (
              <div className="field">
                <label className="label" htmlFor="sport-log-duration">
                  {t('sportLog.durationLabel')}
                </label>
                <input id="sport-log-duration" className="input" type="text" inputMode="decimal" autoComplete="off" required value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
              </div>
            )}
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
