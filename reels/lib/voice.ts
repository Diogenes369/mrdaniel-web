/**
 * Voiceover for the reel pipeline: one interface, two providers, word timings either way.
 *
 * ElevenLabs is the quality path and the only one that returns REAL word timings (character-level
 * alignment from `/with-timestamps`). It is used automatically once ELEVENLABS_API_KEY and
 * ELEVENLABS_VOICE_ID are set. Gemini TTS is the free fallback (the key the repo already has); it
 * returns audio only, so its word timings are ESTIMATED from the audio itself — see
 * `estimateWordTimings`. Every result says which kind it carries (`timing`), so a caption drift on a
 * Gemini reel is a known property of the fallback rather than a mystery.
 *
 * Commercial note (see the research summary, 2026-09-26): ElevenLabs' free plan is non-commercial.
 * A branded reel is commercial use, so the ElevenLabs path needs a paid plan (Starter and up).
 */
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import { probeDuration, speechSpans } from './media.js';

export interface WordTiming {
  text: string;
  /** seconds from the start of the audio file */
  start: number;
  end: number;
}

export interface VoiceResult {
  provider: 'elevenlabs' | 'gemini';
  /** absolute path of the written audio file */
  file: string;
  durationSec: number;
  words: WordTiming[];
  /** `provider` = timings came from the TTS engine; `estimated` = derived from the waveform */
  timing: 'provider' | 'estimated';
}

export type VoiceChoice = 'auto' | 'elevenlabs' | 'gemini';

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

export async function synthesizeVoice(text: string, outDir: string, choice: VoiceChoice = 'auto'): Promise<VoiceResult> {
  const useEleven = choice === 'elevenlabs' || (choice === 'auto' && elevenLabsConfigured());
  if (useEleven) {
    if (!elevenLabsConfigured()) throw new Error('ElevenLabs requested but ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID are not set');
    return elevenLabs(text, outDir);
  }
  return gemini(text, outDir);
}

// ─── ElevenLabs (word timings from the provider) ─────────────────────────────────────────────

async function elevenLabs(text: string, outDir: string): Promise<VoiceResult> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID!;
  const model = process.env.ELEVENLABS_MODEL || 'eleven_v3';
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      // language_code pins Hebrew: without it a short line with a Latin product name ("AI") can be
      // read with English phonetics.
      body: JSON.stringify({ text, model_id: model, language_code: 'he' }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    audio_base64: string;
    alignment?: CharAlignment;
    normalized_alignment?: CharAlignment;
  };
  const file = path.join(outDir, 'voice.mp3');
  fs.writeFileSync(file, Buffer.from(body.audio_base64, 'base64'));
  // `alignment` follows the text as sent, which is what the captions display; the normalized one
  // follows the provider's spoken-form rewrite (numbers spelled out) and would not match the copy.
  const align = body.alignment ?? body.normalized_alignment;
  if (!align) throw new Error('ElevenLabs returned no alignment');
  return { provider: 'elevenlabs', file, durationSec: probeDuration(file), words: wordsFromCharacters(align), timing: 'provider' };
}

interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Folds a per-character alignment into words: a word runs from its first to its last non-space char. */
export function wordsFromCharacters(a: CharAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let cur: WordTiming | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    const s = a.character_start_times_seconds[i];
    const e = a.character_end_times_seconds[i];
    if (!cur) cur = { text: ch, start: s, end: e };
    else {
      cur.text += ch;
      cur.end = e;
    }
  });
  if (cur) words.push(cur);
  return words;
}

// ─── Gemini (free fallback, estimated timings) ───────────────────────────────────────────────

/**
 * `gemini-3.8-flash-tts` first, the lite model second. Probed 2026-09-26: both return Hebrew WAV;
 * `gemini-2.5-flash-preview-tts` (still the dashboard's `reel-tts` model) rejected a short Hebrew
 * line with "Model tried to generate text", so it is deliberately not in this list.
 */
const GEMINI_TTS_MODELS = (process.env.REEL_GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts').split(',');

async function gemini(text: string, outDir: string): Promise<VoiceResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set (root .env)');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const voiceName = process.env.REEL_GEMINI_VOICE || 'Kore';
  let lastErr: unknown;
  for (const model of GEMINI_TTS_MODELS) {
    try {
      const r = await ai.models.generateContent({
        model: model.trim(),
        contents: [{ role: 'user', parts: [{ text }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
      });
      const inline = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) throw new Error(`${model}: no audio in response`);
      const bytes = Buffer.from(inline.data, 'base64');
      const file = path.join(outDir, 'voice.wav');
      // The 3.8 models return a WAV container; older ones returned raw L16 PCM, which needs a header.
      fs.writeFileSync(file, /wav/i.test(inline.mimeType ?? '') ? bytes : pcmToWav(bytes, sampleRate(inline.mimeType)));
      const durationSec = probeDuration(file);
      return { provider: 'gemini', file, durationSec, words: estimateWordTimings(text, file, durationSec), timing: 'estimated' };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Gemini TTS failed on every model: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 300)}`);
}

function sampleRate(mime?: string): number {
  const m = /rate=(\d+)/.exec(mime ?? '');
  return m ? Number(m[1]) : 24000;
}

function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * Word timings without a timing API.
 *
 * Better than spreading the words evenly across the file: FFmpeg's silencedetect finds where speech
 * actually is, so leading/trailing silence and the pauses at commas and full stops are real. When
 * the number of pauses matches the number of phrase breaks in the text, each phrase is pinned to its
 * own speech span; otherwise the words are spread over the whole speech range. Inside a span each
 * word gets time in proportion to its letters (+2 for the gap), which tracks Hebrew speech rate
 * closely enough for 2–3-word caption chunks. Word-level karaoke precision is what ElevenLabs is for.
 */
export function estimateWordTimings(text: string, audioFile: string, durationSec: number): WordTiming[] {
  const phrases = text
    .split(/(?<=[.,!?;:—])\s+/)
    .map((p) => p.trim().split(/\s+/).filter(Boolean))
    .filter((p) => p.length);
  const spans = speechSpans(audioFile, durationSec);
  const groups: { words: string[]; start: number; end: number }[] =
    spans.length === phrases.length
      ? phrases.map((words, i) => ({ words, start: spans[i].start, end: spans[i].end }))
      : [{ words: phrases.flat(), start: spans[0]?.start ?? 0, end: spans[spans.length - 1]?.end ?? durationSec }];

  const out: WordTiming[] = [];
  for (const g of groups) {
    const weights = g.words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = g.start;
    g.words.forEach((w, i) => {
      const d = ((g.end - g.start) * weights[i]) / total;
      out.push({ text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
      t += d;
    });
  }
  return out;
}
