import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combines conditional class names (clsx) and resolves conflicting Tailwind utilities in favor
 * of the last one specified (tailwind-merge) — e.g. `cn('p-2', condition && 'p-4')` correctly
 * yields just `p-4` when `condition` is true, instead of both classes colliding. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
