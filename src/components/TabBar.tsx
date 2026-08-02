import { TAB_PATHS, navigate, tabOf, useRoute, type TabName } from '../router';
import { ClockIcon, DumbbellIcon, HomeIcon, ListIcon, PlayIcon } from './icons';

const TABS: { name: TabName; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] =
  [
    { name: 'home', label: 'Home', Icon: HomeIcon },
    { name: 'exercises', label: 'Exercises', Icon: DumbbellIcon },
    { name: 'trainings', label: 'Trainings', Icon: ListIcon },
    { name: 'session', label: 'Session', Icon: PlayIcon },
    { name: 'history', label: 'History', Icon: ClockIcon },
  ];

export function TabBar() {
  const active = tabOf(useRoute());

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ name, label, Icon }) => (
        <button
          key={name}
          className="tab"
          aria-current={active === name ? 'page' : undefined}
          onClick={() => navigate(TAB_PATHS[name])}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
