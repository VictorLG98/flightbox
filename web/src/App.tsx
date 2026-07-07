import { useHashRoute } from './router.js';
import { Dashboard } from './Dashboard.js';
import { SessionList } from './SessionList.js';
import { SessionView } from './SessionView.js';
import { CompareView } from './CompareView.js';

export function App() {
  const route = useHashRoute();
  const active = route.route === 'list' ? 'sessions' : route.route === 'dashboard' ? 'dashboard' : '';
  return (
    <>
      <header className="cockpit-header">
        <a className="brand" href="#/">
          <span className="mark">trace<b>box</b></span>
          <span className="sub">session trace recorder</span>
        </a>
        <nav className="nav" aria-label="Primary">
          <a href="#/" className={active === 'dashboard' ? 'on' : ''}>Dashboard</a>
          <a href="#/sessions" className={active === 'sessions' ? 'on' : ''}>Sessions</a>
        </nav>
        <span className="rec"><span className="led" aria-hidden="true" />REC · LOCAL</span>
      </header>
      <main className="shell">
        {route.route === 'session' ? (
          <SessionView id={route.id} />
        ) : route.route === 'compare' ? (
          <CompareView a={route.a} b={route.b} />
        ) : route.route === 'list' ? (
          <SessionList day={route.day} />
        ) : (
          <Dashboard />
        )}
      </main>
    </>
  );
}
