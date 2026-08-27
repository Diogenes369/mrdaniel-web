import { useEffect, useState } from 'react';

/** True once the browser reports an idle moment (or a fallback timeout fires) after mount — used
 * to defer mounting the heavy 3D scene so it never competes with initial page paint. */
export function useDeferredMount(timeout = 1500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'function') {
      const id = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.requestIdleCallback(() => setReady(true), { timeout });
    return () => window.cancelIdleCallback(id);
  }, [timeout]);

  return ready;
}
