import { TAB_PATHS, navigate, tabOf, useRoute, type TabName } from '../router';
import { useLanguage, type TranslationKey } from '../data/i18n';
import { ClockIcon, DumbbellIcon, HomeIcon, ListIcon, PlayIcon } from './icons';

const TABS: {
  name: TabName;
  labelKey: TranslationKey;
  Icon: (p: { className?: string }) => React.ReactElement;
}[] = [
  { name: 'home', labelKey: 'tabbar.home', Icon: HomeIcon },
  { name: 'exercises', labelKey: 'tabbar.exercises', Icon: DumbbellIcon },
  { name: 'trainings', labelKey: 'tabbar.trainings', Icon: ListIcon },
  { name: 'session', labelKey: 'tabbar.session', Icon: PlayIcon },
  { name: 'history', labelKey: 'tabbar.history', Icon: ClockIcon },
];

export function TabBar() {
  const active = tabOf(useRoute());
  const { t } = useLanguage();

  return (
    <nav className="tabbar" aria-label={t('tabbar.aria')}>
      {TABS.map(({ name, labelKey, Icon }) => (
        <button
          key={name}
          className="tab"
          aria-current={active === name ? 'page' : undefined}
          onClick={() => navigate(TAB_PATHS[name])}
        >
          <Icon />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
