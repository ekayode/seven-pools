# Seven Pools

A 12-minute daily chakra sit (one pool per weekday, from Aang's seven chakras with Guru Pathik), as an installable home-screen web app.

## Files

- `content/days.json`: all meditation content (days, breaths, questions, seals). Edit here.
- `app.js`: screens, session timing, bells, breath tones, voice cues.
- `styles.css`, `index.html`: layout.
- `manifest.webmanifest`, `sw.js`, `icons/`: what makes it installable and work offline.
- `audio/`: the voice recordings (ElevenLabs, designed voice "Guru Pathik", model Eleven v4), listed in `audio/clips.json`.
- `tools/voice.mjs`: records the spoken lines. Run it with no arguments for help.

## Changing what the voice says

Edit the `say` and `common` lines in `content/days.json`, then re-record. Only changed lines are re-recorded:

```bash
node tools/voice.mjs record DJEpQQM0TKKRXElYuZUn
```

The free ElevenLabs plan allows 10,000 characters a month; the full script is about 2,900. Lines without a recording fall back to the device's own voice.

After changing any file, bump `VERSION` in `sw.js` so phones pick up the update.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765.

## Install on iPhone

Host the folder on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages). Open the URL in Safari, tap Share, then Add to Home Screen.

## Moving to native later

`content/days.json` is the source of truth and can be bundled straight into a SwiftUI app. Port these pieces:

- `SEGS` in `app.js`: the six-step template (durations, spoken lines).
- `tick()` / `phaseIdx()`: the pacing loop for breath patterns.
- `bell()` / `tone()`: synthesized sine tones (AVAudioEngine), and `say()` (AVSpeechSynthesizer).

What native adds: audio and timing that keep running with the phone locked (background audio mode).
