# JARVIS showcase videos

`<JarvisShowcaseVideo />` (src/components/content/JarvisShowcaseVideo.tsx) streams local MP4
files from this folder — served at `/videos/jarvis/`. No YouTube / external embeds.

Drop the exported clips from `D:\123` here, using these filenames (or edit the `DEFAULT_CLIPS`
list in the component to match your own):

| file                     | label (he)                     |
|--------------------------|--------------------------------|
| `overview.mp4`           | סקירת מערכת JARVIS             |
| `voice-interface.mp4`    | ממשק קולי טבעי                 |
| `business-automation.mp4`| אוטומציה עסקית                 |
| `smart-home.mp4`         | שליטה בבית ובמשרד החכם        |

Recommended: H.264/AAC MP4, 1920×1080, web-optimised (`-movflags +faststart`).
Until a file exists the tile shows an on-brand "coming soon" state — safe to deploy empty.
