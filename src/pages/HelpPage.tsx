/**
 * Help — SPEC §5.9.
 *
 * A push view off Home rather than a sixth tab, same arrangement as Stats and
 * Profile (D1 locks the navigation at five). Static: no `useGym()` beyond
 * `t()`/language, nothing stored, just a walkthrough pairing a real
 * screenshot with a short caption for each of the five tabs, in the order
 * someone would actually hit them tapping across the bar.
 */
import { useLanguage, type TranslationKey } from '../data/i18n';
import { ChevronLeftIcon } from '../components/icons';
import { navigate } from '../router';
import homeShot from '../assets/help/home.png';
import exercisesShot from '../assets/help/exercises.png';
import trainingsShot from '../assets/help/trainings.png';
import sessionShot from '../assets/help/session.png';
import historyShot from '../assets/help/history.png';
import './HelpPage.css';

const SECTIONS: { titleKey: TranslationKey; bodyKey: TranslationKey; image: string }[] = [
  { titleKey: 'help.home.title', bodyKey: 'help.home.body', image: homeShot },
  { titleKey: 'help.exercises.title', bodyKey: 'help.exercises.body', image: exercisesShot },
  { titleKey: 'help.trainings.title', bodyKey: 'help.trainings.body', image: trainingsShot },
  { titleKey: 'help.session.title', bodyKey: 'help.session.body', image: sessionShot },
  { titleKey: 'help.history.title', bodyKey: 'help.history.body', image: historyShot },
];

export function HelpPage() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <div className="page-header">
        <button className="help-back" onClick={() => navigate('/home')} aria-label={t('help.backToHomeAria')}>
          <ChevronLeftIcon />
          <span>{t('tabbar.home')}</span>
        </button>
        <h1 className="page-title">{t('help.title')}</h1>
        <div className="page-sub">{t('help.subtitle')}</div>
      </div>

      {SECTIONS.map((section) => (
        <section className="section" key={section.titleKey}>
          <div className="card help-card">
            <img className="help-shot" src={section.image} alt="" />
            <div className="card-pad">
              <h2 className="help-card-title">{t(section.titleKey)}</h2>
              <p className="help-card-body">{t(section.bodyKey)}</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
