# JARVIS showcase videos

`<JarvisShowcaseVideo />` (src/components/content/JarvisShowcaseVideo.tsx) streams these local
MP4 files, served at `/videos/jarvis/`. No YouTube / external embeds. TikTok / Reels (9:16)
portrait format.

| file         | source (C:\Projects\123)                             |
|--------------|------------------------------------------------------|
| `clip-1.mp4` | WhatsApp Video 2026-08-29 at 00.53.53 (1).mp4        |
| `clip-2.mp4` | WhatsApp Video 2026-08-29 at 00.53.53.mp4            |
| `clip-3.mp4` | WhatsApp Video 2026-08-29 at 00.56.31.mp4            |
| `clip-4.mp4` | WhatsApp Video 2026-08-29 at 02.34.13.mp4            |

To swap clips: drop new `clip-N.mp4` files here (same names) or edit `DEFAULT_CLIPS` in the
component. A missing file degrades to an on-brand "not found" tile.
