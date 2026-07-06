import { useEffect, useState } from 'react';

export type Route = { route: 'list' } | { route: 'session'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/session\/(.+)$/.exec(hash);
  if (m) return { route: 'session', id: decodeURIComponent(m[1]) };
  return { route: 'list' };
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
