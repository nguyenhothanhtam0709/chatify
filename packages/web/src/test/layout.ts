import { vi } from 'vitest';

export const ITEM_HEIGHT = 100;
export const VIEWPORT_HEIGHT = 300;

/**
 * jsdom has no layout, so give it a simple one: every item in the scroller's content is
 * ITEM_HEIGHT tall, stacked from the top of the content, offset by the viewport's scrollTop.
 */
export function stubLayout() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  const rect = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset['slot'] === 'message-scroller-viewport') return rect(0, VIEWPORT_HEIGHT);
    const content = this.parentElement;
    if (content?.dataset['slot'] === 'message-scroller-content') {
      const viewport = content.closest<HTMLElement>('[data-slot="message-scroller-viewport"]')!;
      const items = Array.from(content.children).filter(
        (child) => !(child as HTMLElement).hasAttribute('data-message-scroller-spacer'),
      );
      return rect(items.indexOf(this) * ITEM_HEIGHT - viewport.scrollTop, ITEM_HEIGHT);
    }
    return original.call(this);
  });
  // jsdom has no scrollTo; the scroller uses it to follow the bottom.
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, options?: unknown) {
    this.scrollTop = (options as ScrollToOptions).top ?? 0;
  } as typeof HTMLElement.prototype.scrollTo;
  const isViewport = (el: HTMLElement) => el.dataset['slot'] === 'message-scroller-viewport';
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return isViewport(this as HTMLElement) ? VIEWPORT_HEIGHT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      const el = this as HTMLElement;
      return isViewport(el)
        ? el.querySelectorAll('[data-slot="message-scroller-item"]').length * ITEM_HEIGHT
        : 0;
    },
  });
  // Like a browser, the viewport cannot scroll past its content: scrollTop stays within
  // 0..scrollHeight - clientHeight.
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return scrollTop.get!.call(this);
    },
    set(value: number) {
      const el = this as HTMLElement;
      const top = isViewport(el)
        ? Math.min(Math.max(0, value), Math.max(0, el.scrollHeight - el.clientHeight))
        : value;
      scrollTop.set!.call(el, top);
    },
  });
}

/** Undoes `stubLayout`. */
export function unstubLayout() {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop');
}
