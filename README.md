# apex-inference.xyz

Brutalist landing page for an OpenAI-compatible inference provider. Vite + React + Tailwind.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build -> dist/
npm run preview  # serve the build
```

## Layout

```
index.html              vite entry
tailwind.config.js      tailwind content globs
postcss.config.js       tailwind + autoprefixer
src/
  main.jsx              react root
  index.css            tailwind directives + custom (.glow .scan .grid-bg .machine-dump)
  data.js              models, infra copy, terminal SSE lines, machine dump text
  App.jsx              page shell + human/machine state
  components/
    Terminal.jsx       typewriter SSE stream w/ amber syntax coloring
    Emphasis.jsx       __x__ -> amber highlight
    Toggle.jsx         floating human/machine switch
```

## Notes

- `MACHINE` toggle unmounts the styled tree and renders a raw `<pre>` dump with a content-aware boot sequence.
- Model IDs in `src/data.js` are verbatim. Not typos.
- No hardware/host references anywhere. Software-side numbers only.

## Keyboard

| key | action |
|---|---|
| `m` | toggle human/machine |
| `1` `2` `3` | jump to infra / roster / policy |
| `esc` | back to top |
| `` ` `` | global trace (or type `>trace` anywhere) |

## Phase 4 systems

- **Intake handshake** — `src/components/Handshake.jsx`. Live pool math writes DOM-direct
  (refs, zero re-renders while typing). Enter streams a provisioning sequence, scramble-resolves
  a mock `sk-apex-live-` key, emits a curl against the 1M-context Nemotron.
- **DOM-native viz** — `src/components/DataViz.jsx`. Block-char histogram, 96×48 1px-div
  KV-cache heatmap driven by a single rAF loop with dirty-checked color writes, token flux strip.
  Histogram hover dispatches `apex:p99` → header readout bridges via ref. No SVG, no chart lib.
- **Temporal wear** — `src/components/TemporalWear.jsx`. Staged phosphor burn-in (2m/5m/10m)
  warms the terminal glow; `[data-wear]` elements accumulate hover ghosts at 1–2% opacity.
- **Trace overlay** — `src/components/TraceOverlay.jsx`. 1px line drop, routing waterfall
  (`iad-02 → fra-01 → syd-01 [timeout] → fallback`), 4s, retracts.

## Phase 6 control plane

- `src/event-horizon.worker.js` owns a deterministic scheduler simulation outside React.
- Under cross-origin isolation it publishes 12-word binary frames into a 256-frame
  `SharedArrayBuffer` ring and commits with `Atomics`. The worker sleeps with `Atomics.wait`.
- `src/components/EventHorizon.jsx` reads the ring with a sequence lock and writes registers,
  event tape cells, logs, and health states directly to DOM refs. Live frames do not enter
  React state.
- Hovering the event tape reads historical frames and bridges their TTFT into the global p99
  header. Click pins an exact frame. `replay 4`, `live`, `fault`, `seed`, `dump`, and `fork`
  are control-plane commands.
- Tabs form an observer mesh with `BroadcastChannel`. Lowest tab id becomes primary; observers
  render the primary's binary snapshots. `fork` opens another observer and forces an election.
- `vite.config.js` serves COOP/COEP headers in development and preview. Production must emit
  the same headers or the system drops to its MessagePort ring fallback.
