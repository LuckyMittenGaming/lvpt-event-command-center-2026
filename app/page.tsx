import { Dashboard } from '../components/dashboard';
import { events } from '../data/events';

export default function Home() {
  return <Dashboard initialEvents={events} />;
}
