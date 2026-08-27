/** Ensures `fn` runs at most once per animation frame, coalescing a burst of high-frequency
 *  events (scroll, resize) down to the browser's own paint cadence instead of firing — and
 *  potentially triggering a React state update — on every raw event. */
export function rafThrottle<T extends (...args: never[]) => void>(fn: T): T {
  let ticking = false;
  return ((...args: Parameters<T>) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      fn(...args);
    });
  }) as T;
}
