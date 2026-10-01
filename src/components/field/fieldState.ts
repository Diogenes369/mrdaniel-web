import { useCallback } from 'react';

/**
 * The one channel between the page and the glyph field.
 *
 * DOM components WRITE here (which element is which story beat, which blocks of text need a quiet
 * patch behind them, where the glyph-built headline sits, a click that should ripple through the
 * field); the field's frame loop READS it once per frame. Plain module state on purpose: a scroll
 * or a pointer move must never cost a React render.
 */

/** The story beats the field knows how to stage, in reading order. */
export type BeatKey = 'hero' | 'noise' | 'order' | 'path' | 'start';

export interface Ripple {
  /** Viewport CSS px. */
  x: number;
  y: number;
  /** performance.now() at the click. */
  at: number;
}

export const fieldState = {
  beats: new Map<HTMLElement, BeatKey>(),
  quiet: new Set<HTMLElement>(),
  headline: null as HTMLElement | null,
  /** Bumped whenever the headline element (or its text) changes, so the mask is rebuilt. */
  headlineVersion: 0,
  phrases: [] as string[],
  phrasesVersion: 0,
  ripples: [] as Ripple[],
};

/** Ref callback: marks a section as one beat of the story (React 19 ref cleanup). */
export function useFieldBeat(key: BeatKey) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      fieldState.beats.set(el, key);
      return () => {
        fieldState.beats.delete(el);
      };
    },
    [key]
  );
}

/** Ref callback: the field dims itself behind this block so the text over it stays readable. */
export function useFieldQuiet() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    fieldState.quiet.add(el);
    return () => {
      fieldState.quiet.delete(el);
    };
  }, []);
}

/** Ref callback: this element's text is redrawn by the field, built out of glyphs. */
export function useFieldHeadline() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    fieldState.headline = el;
    fieldState.headlineVersion++;
    return () => {
      if (fieldState.headline === el) fieldState.headline = null;
      fieldState.headlineVersion++;
    };
  }, []);
}

export function setFieldPhrases(phrases: string[]) {
  fieldState.phrases = phrases;
  fieldState.phrasesVersion++;
}

/** A shock ring through the field from a click — the page answering the hand that touched it. */
export function fieldRipple(x: number, y: number) {
  fieldState.ripples.push({ x, y, at: performance.now() });
  if (fieldState.ripples.length > 4) fieldState.ripples.shift();
}
