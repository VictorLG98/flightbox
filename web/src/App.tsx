import { useHashRoute } from './router.js';
import { SessionList } from './SessionList.js';
import { SessionView } from './SessionView.js';

export function App() {
  const route = useHashRoute();
  return (
    <main>
      <header><a href="#/">flightbox</a></header>
      {route.route === 'list' ? <SessionList /> : <SessionView id={route.id} />}
    </main>
  );
}
