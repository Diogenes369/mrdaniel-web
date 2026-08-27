import { useRef } from 'react';

/**
 * No-op: sections render at full opacity/position immediately. Kept as a hook so callers
 * (`ref={dissolveRef}` on a <section>) don't need to change.
 */
export function useSectionDissolve<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  return ref;
}
