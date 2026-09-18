# generated-videos

Rendered showcase videos, served by the dashboard at `/generated-videos/<name>.mp4` (plus a `.jpg`
poster of the same name). Committed on purpose: this is how a published video reaches the deployed
dashboard.

Produced by `scripts/generate-code-video.mjs` — see `docs/CODE_VIDEO.md`. Nothing writes here
automatically; a video lands here only when someone runs `render --publish` or `publish`.
