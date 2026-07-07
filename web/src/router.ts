import { useEffect, useState } from 'react';

export type Route =
  | { route: 'dashboard' }
  | { route: 'list'; day?: string }
  | { route: 'session'; id: string }
  | { route: 'compare'; a: string; b: string };

export function parseHash(hash: string): Route {
  const cmp = /^#\/compare\/([^/]+)\/([^/]+)\/?$/.exec(hash);
  if (cmp) return { route: 'compare', a: decodeURIComponent(cmp[1]), b: decodeURIComponent(cmp[2]) };
  const m = /^#\/session\/(.+)$/.exec(hash);
  if (m) return { route: 'session', id: decodeURIComponent(m[1]) };
  const day = /^#\/sessions\/(\d{4}-\d{2}-\d{2})\/?$/.exec(hash);
  if (day) return { route: 'list', day: day[1] };
  if (/^#\/sessions\/?$/.test(hash)) return { route: 'list' };
  return { route: 'dashboard' };
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
