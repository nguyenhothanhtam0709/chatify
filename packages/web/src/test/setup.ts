import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// jsdom has no matchMedia; the sidebar's mobile detection and the theme need it.
// (Tests marked `@vitest-environment node` have no window.)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// cmdk (shadcn Command) needs ResizeObserver and scrollIntoView, which jsdom lacks.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  if (typeof window === 'undefined') return;
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});
afterAll(() => server.close());
