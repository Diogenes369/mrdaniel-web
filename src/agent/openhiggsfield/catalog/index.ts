import { dop } from "./dop.js";
import { flux2 } from "./flux-2.js";
import { flux3 } from "./flux-3.js";
import { grokImagine2 } from "./grok-imagine-2.js";
import { grokImagineVideo15 } from "./grok-imagine-video-1.5.js";
import { happyHorse1 } from "./happy-horse-1.js";
import { happyHorse11 } from "./happy-horse-1.1.js";
import { ideogram4 } from "./ideogram-4.js";
import { kling25 } from "./kling-2.5.js";
import { kling26 } from "./kling-2.6.js";
import {
  kling34k,
  kling3MotionPro,
  kling3MotionStd,
  kling3Pro,
  kling3Std,
  kling3Turbo,
} from "./kling-3.js";
import { klingO1 } from "./kling-o1.js";
import { klingO3 } from "./kling-o3.js";
import { ltx25Fast } from "./ltx-2.5-fast.js";
import { ltx25Pro } from "./ltx-2.5-pro.js";
import { minimaxH3 } from "./minimax-h3.js";
import { minimaxHailuo23 } from "./minimax-hailuo-2.3.js";
import { parseSettings } from "./parse-settings.js";
import { pixverse6 } from "./pixverse-6.js";
import { qwenImage3 } from "./qwen-image-3.js";
import { recraft41 } from "./recraft-4.1.js";
import { seedance2, seedance2Fast, seedance2Mini } from "./seedance-2.js";
import { seedance25, seedance25Edit, seedance25Extend } from "./seedance-2.5.js";
import { soul2, soulCinema } from "./soul.js";
import type { ModelEntry } from "./types.js";
import { wan26 } from "./wan-2.6.js";
import { wan27 } from "./wan-2.7.js";
import { wan3 } from "./wan-3.js";
import { wan3Prime } from "./wan-3-prime.js";
import { zImageTurbo } from "./z-image-turbo.js";

export const MODELS: readonly ModelEntry[] = [
  soul2,
  soulCinema,
  seedance25,
  seedance25Edit,
  seedance25Extend,
  seedance2,
  seedance2Fast,
  seedance2Mini,
  kling3Turbo,
  kling3Std,
  kling3Pro,
  kling34k,
  kling3MotionStd,
  kling3MotionPro,
  flux2,
  grokImagine2,
  ideogram4,
  recraft41,
  qwenImage3,
  zImageTurbo,
  wan3,
  wan3Prime,
  wan27,
  wan26,
  flux3,
  minimaxH3,
  minimaxHailuo23,
  happyHorse1,
  happyHorse11,
  kling26,
  kling25,
  klingO3,
  klingO1,
  ltx25Fast,
  ltx25Pro,
  grokImagineVideo15,
  pixverse6,
  dop,
];

export function getModel(id: string): ModelEntry {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}

export type { GenerationPlane, MediaItem, MediaRole, ModelEntry, PlatformPaths, Surface } from "./types.js";
export { parseSettings };
