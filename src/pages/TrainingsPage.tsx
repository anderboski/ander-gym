import { daysBetween, formatDate, formatDaysAgo, lastSessionForTraining } from '../data/derive';
import { bodyPartsLabel } from '../data/parse';
import { useGym } from '../data/store';
import { ChevronRightIcon } from '../components/icons';
import { navigate } from '../router';
import './TrainingsPage.css';

export function TrainingsPage() {
  const { trainings, sessions, status } = useGym();
  const now = new Date();

  if (status === 'loading') return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Trainings</h1>
        <div className="page-sub">Your training days, in rotation order</div>
      </div>

      {trainings.length === 0 ? (
        <div className="empty">No training days found in data/training_days.txt.</div>
      ) : (
        <div className="tr-list">
          {trainings.map((training) => {
            const last = lastSessionForTraining(training.id, sessions);
            const count = training.exerciseIds.length;

            return (
              <button
                key={training.id}
                className="tr-card"
                onClick={() => navigate(`/trainings/${training.id}`)}
              >
                <div className="tr-card-main">
                  <div className="tr-card-parts">{bodyPartsLabel(training.label)}</div>
                  <div className="tr-card-sub">
                    <span>
                      {last
                        ? `${formatDate(last.startedAt)} · ${formatDaysAgo(
                            daysBetween(new Date(last.startedAt), now),
                          )}`
                        : 'Never done'}
                    </span>
                    <span className="sep">·</span>
                    <span>
                      {count} {count === 1 ? 'exercise' : 'exercises'}
                    </span>
                  </div>
                </div>
                <ChevronRightIcon />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
