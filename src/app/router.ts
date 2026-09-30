// Hash router. Hash URLs need no server rewrites (static hosting) and work in the Kindle browser.
import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'game'; tuid: string }
  | { name: 'play'; tuid: string }
  | { name: 'settings' }
  | { name: 'help' };

export type RouteName = Route['name'];

export type Query = Record<string, string>;

export interface Location {
  route: Route;
  query: Query;
  /** False when the hash did not match any route and fell back to Home. */
  matched: boolean;
}

export const HOME: Route = { name: 'home' };

// IFDB TUIDs are short alphanumeric ids; stay permissive but reject separators.
const TUID = /^[A-Za-z0-9_-]+$/;

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

export function parseQuery(search: string): Query {
  const query: Query = {};
  if (!search) return query;
  const pairs = search.split('&');
  for (let i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    const eq = pairs[i].indexOf('=');
    const key = decode(eq < 0 ? pairs[i] : pairs[i].slice(0, eq));
    const value = eq < 0 ? '' : decode(pairs[i].slice(eq + 1));
    if (key && value !== null) query[key] = value;
  }
  return query;
}

/** Serialises a query with sorted keys (stable URLs); empty values are dropped. */
export function formatQuery(query: Query): string {
  const keys = Object.keys(query).sort();
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const value = query[keys[i]];
    if (value === undefined || value === '') continue;
    parts.push(encodeURIComponent(keys[i]) + '=' + encodeURIComponent(value));
  }
  return parts.join('&');
}

function matchPath(segments: string[]): Route | null {
  if (segments.length === 1) {
    switch (segments[0]) {
      case 'home':
        return { name: 'home' };
      case 'library':
        return { name: 'library' };
      case 'settings':
        return { name: 'settings' };
      case 'help':
        return { name: 'help' };
    }
    return null;
  }
  if (segments.length === 2 && (segments[0] === 'game' || segments[0] === 'play')) {
    const tuid = decode(segments[1]);
    if (tuid && TUID.test(tuid)) return { name: segments[0], tuid };
  }
  return null;
}

export function parseHash(hash: string): Location {
  let rest = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  const q = rest.indexOf('?');
  const search = q < 0 ? '' : rest.slice(q + 1);
  rest = q < 0 ? rest : rest.slice(0, q);

  const segments = rest.split('/').filter((s) => s !== '');
  if (segments.length === 0) return { route: HOME, query: parseQuery(search), matched: true };

  const route = matchPath(segments);
  if (!route) return { route: HOME, query: {}, matched: false };
  return { route, query: parseQuery(search), matched: true };
}

export function formatHash(route: Route, query: Query = {}): string {
  let path: string;
  switch (route.name) {
    case 'game':
    case 'play':
      path = '/' + route.name + '/' + encodeURIComponent(route.tuid);
      break;
    default:
      path = '/' + route.name;
  }
  const search = formatQuery(query);
  return '#' + path + (search ? '?' + search : '');
}

export function navigate(route: Route, query?: Query): void {
  window.location.hash = formatHash(route, query);
}

/** Current location, updated on `hashchange`. Unknown routes are replaced by Home (no history entry). */
export function useLocation(): Location {
  const [location, setLocation] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    function sync() {
      const next = parseHash(window.location.hash);
      const canonical = formatHash(next.route, next.query);
      // Canonicalise the URL (e.g. unknown route → #/home) without adding a history entry.
      if (window.location.hash !== canonical) window.location.replace(canonical);
      setLocation(next);
    }
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return location;
}
