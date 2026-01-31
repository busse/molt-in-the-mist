export type Route =
  | { view: 'graph' }
  | { view: 'agents' }
  | { view: 'agent'; agentId: string }
  | { view: 'posts' }
  | { view: 'post'; postId: string };

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const BASE_NORMALIZED = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

let routeHandler: ((route: Route) => void) | null = null;

function stripBase(pathname: string): string {
  if (BASE_NORMALIZED === '/') return pathname;
  if (pathname === BASE_NORMALIZED.slice(0, -1)) return '/';
  if (pathname.startsWith(BASE_NORMALIZED)) {
    return `/${pathname.slice(BASE_NORMALIZED.length)}`;
  }
  return pathname;
}

export function toAppHref(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  if (BASE_NORMALIZED === '/') {
    return `/${normalized}`;
  }
  return `${BASE_NORMALIZED}${normalized}`;
}

export function getCurrentRoute(): Route {
  const pathname = stripBase(window.location.pathname);
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return { view: 'graph' };

  if (segments[0] === 'agents') {
    if (segments[1]) {
      return { view: 'agent', agentId: decodeURIComponent(segments[1]) };
    }
    return { view: 'agents' };
  }

  if (segments[0] === 'posts') {
    if (segments[1]) {
      return { view: 'post', postId: decodeURIComponent(segments[1]) };
    }
    return { view: 'posts' };
  }

  return { view: 'graph' };
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const url = new URL(path, window.location.origin);
  if (options.replace) {
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  } else {
    history.pushState({}, '', url.pathname + url.search + url.hash);
  }
  routeHandler?.(getCurrentRoute());
}

export function initRouter(handler: (route: Route) => void): void {
  routeHandler = handler;

  window.addEventListener('popstate', () => {
    routeHandler?.(getCurrentRoute());
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest('a[data-nav]') as HTMLAnchorElement | null;
    if (!link) return;
    if (link.target === '_blank') return;
    if (link.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(link.href);
  });
}
