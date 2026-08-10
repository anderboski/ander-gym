import { TabBar } from './components/TabBar';
import { WhatsNewGate } from './components/Changelog';
import { useRoute } from './router';
import { HomePage } from './pages/HomePage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { HelpPage } from './pages/HelpPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { TrainingDetailPage } from './pages/TrainingDetailPage';
import { SessionPage } from './pages/SessionPage';
import { HistoryPage } from './pages/HistoryPage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';

export function App() {
  const route = useRoute();

  return (
    <div className="app">
      {route.name === 'home' && <HomePage />}
      {route.name === 'stats' && <StatsPage />}
      {route.name === 'profile' && <ProfilePage />}
      {route.name === 'help' && <HelpPage />}
      {route.name === 'exercises' && <ExercisesPage />}
      {route.name === 'trainings' && <TrainingsPage />}
      {route.name === 'training' && <TrainingDetailPage trainingId={route.id} />}
      {route.name === 'session' && <SessionPage />}
      {route.name === 'history' && <HistoryPage />}
      {route.name === 'historyDetail' && <HistoryDetailPage sessionId={route.id} />}
      <TabBar />
      <WhatsNewGate />
    </div>
  );
}
