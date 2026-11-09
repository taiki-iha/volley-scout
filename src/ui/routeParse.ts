export type Route =
  | { name: 'join' } | { name: 'home' } | { name: 'roster' } | { name: 'opponents' } | { name: 'settings' }
  | { name: 'matchNew' } | { name: 'analysis' }
  | { name: 'matchLive' | 'matchView' | 'matchReception' | 'matchEdit'; id: string }
  | { name: 'notFound' };

/** location.hash（例 '#/match/abc/live'）をルートに変換する */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0].replace(/\/+$/, '') || '/';
  switch (path) {
    case '/': return { name: 'home' };
    case '/join': return { name: 'join' };
    case '/roster': return { name: 'roster' };
    case '/opponents': return { name: 'opponents' };
    case '/settings': return { name: 'settings' };
    case '/match/new': return { name: 'matchNew' };
    case '/analysis': return { name: 'analysis' };
  }
  const m = /^\/match\/([^/]+)\/(live|view|reception|edit)$/.exec(path);
  if (m) {
    const names = { live: 'matchLive', view: 'matchView', reception: 'matchReception', edit: 'matchEdit' } as const;
    return { name: names[m[2] as keyof typeof names], id: decodeURIComponent(m[1]) };
  }
  return { name: 'notFound' };
}
