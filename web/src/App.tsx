import { useHashRoute } from './router.js';
import { SessionList } from './SessionList.js';
import { SessionView } from './SessionView.js';

export function App() {
  const route = useHashRoute();
  return (
    <>
      <header className="cockpit-header">
        <a className="brand" href="#/">
          <span className="mark">flight<b>box</b></span>
          <span className="sub">flight data recorder</span>
        </a>
        <span className="rec"><span className="led" aria-hidden="true" />REC · LOCAL</span>
      </header>
      <main className="shell">
        {route.route === 'list' ? <SessionList /> : <SessionView id={route.id} />}
      </main>
    </>
  );
}
