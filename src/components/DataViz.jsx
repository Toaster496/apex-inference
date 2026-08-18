import { useEffect, useMemo, useRef } from 'react'
import Reveal from './Reveal.jsx'

/* ——————————————————————————————————————————————
   DOM-native data viz. No SVG. No canvas. No libs.
   Blocks, divs, and a custom-event bridge to the
   global header readout.
   —————————————————————————————————————————————— */

/* ——— latency histogram (block chars) ——— */

const EDGES = [60, 70, 81, 94, 109, 126, 146, 170, 197, 228, 265, 307, 356, 413, 479, 556, 645, 748, 868, 1007]
const WEIGHTS = [6, 22, 48, 74, 88, 80, 64, 49, 37, 28, 21, 16, 12, 9, 7, 5, 4, 3, 2]
const COUNTS = WEIGHTS.map((w, i) => w * (137 + i * 11))
const MAX_W = Math.max(...WEIGHTS)
const GLYPHS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function bar(w) {
  const h = Math.max(1, Math.round((w / MAX_W) * 14 * 8) / 8)
  const full = Math.floor(h)
  const frac = h - full
  let s = ''
  if (frac > 0.05) s = GLYPHS[Math.round(frac * 8)] + '\n'
  s += Array(full).fill('█').join('\n')
  return s
}

function Histogram() {
  const readoutRef = useRef(null)

  const enter = (i) => {
    const lo = EDGES[i]
    const hi = EDGES[i + 1]
    if (readoutRef.current)
      readoutRef.current.textContent = `bucket ${lo}–${hi}ms · n=${COUNTS[i].toLocaleString('en-US')} · header p99 ← ${hi}ms`
    window.dispatchEvent(new CustomEvent('apex:p99', { detail: { v: hi } }))
  }
  const leave = () => {
    if (readoutRef.current)
      readoutRef.current.textContent = 'hover a bin — the header p99 readout bridges to that bucket.'
    window.dispatchEvent(new CustomEvent('apex:p99:clear'))
  }

  return (
    <div className="border border-zinc-800/70 bg-zinc-950/30 rounded-sm p-5 h-full flex flex-col" data-wear>
      <div className="flex items-baseline justify-between mb-6">
        <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">ttft distribution · 24h</p>
        <p className="text-[9px] tabular text-zinc-700">n=2.4M req</p>
      </div>

      <div className="flex items-end gap-[3px] h-[180px]">
        {WEIGHTS.map((w, i) => (
          <div
            key={i}
            className="hbin flex-1 h-full flex flex-col justify-end cursor-crosshair"
            onMouseEnter={() => enter(i)}
            onMouseLeave={leave}
          >
            <pre className="hbin-bar text-center font-mono text-[10px] leading-[11px]">{bar(w)}</pre>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-2 text-[9px] tabular text-zinc-700 font-mono">
        <span>60ms</span>
        <span>126</span>
        <span>265</span>
        <span>556</span>
        <span>1007ms</span>
      </div>

      <p ref={readoutRef} className="mt-5 text-[10px] text-zinc-600 font-mono min-h-[16px] tabular">
        hover a bin — the header p99 readout bridges to that bucket.
      </p>
    </div>
  )
}

/* ——— KV-cache heatmap (1px divs, rAF simulation) ——— */

const COLS = 64
const ROWS = 36
const N = COLS * ROWS
const C0 = [39, 39, 42]    // zinc-800
const C1 = [245, 158, 11]  // amber-500

function heatCss(h) {
  const t = Math.pow(Math.min(1, h), 0.75)
  const r = Math.round(C0[0] + (C1[0] - C0[0]) * t)
  const g = Math.round(C0[1] + (C1[1] - C0[1]) * t)
  const b = Math.round(C0[2] + (C1[2] - C0[2]) * t)
  return `rgb(${r},${g},${b})`
}

function Heatmap() {
  const gridRef = useRef(null)
  const readRef = useRef(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const cells = grid.children
    const heat = new Float32Array(N)
    const written = new Float32Array(N).fill(-1)

    // initial paint
    for (let i = 0; i < N; i++) {
      cells[i].style.backgroundColor = heatCss(0)
    }

    // write heads — simulated prefix-affinity traffic
    const heads = Array.from({ length: 5 }, () => ({
      x: Math.random() * COLS,
      y: Math.random() * ROWS,
      a: Math.random() * Math.PI * 2,
    }))

    let raf
    const frame = () => {
      // advance heads, deposit heat
      for (const hd of heads) {
        hd.a += (Math.random() - 0.5) * 0.8
        hd.x = (hd.x + Math.cos(hd.a) * 1.3 + COLS) % COLS
        hd.y = (hd.y + Math.sin(hd.a) * 1.3 + ROWS) % ROWS
        const cx = Math.floor(hd.x)
        const cy = Math.floor(hd.y)
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const idx = ((cy + dy) % ROWS) * COLS + ((cx + dx) % COLS)
            heat[idx] = Math.min(1, heat[idx] + 0.5)
          }
      }
      // eviction churn — cold cells flicker
      for (let k = 0; k < 10; k++) {
        const idx = Math.floor(Math.random() * N)
        heat[idx] = Math.max(heat[idx], 0.1 + Math.random() * 0.25)
      }
      // decay + dirty-checked color writes
      for (let i = 0; i < N; i++) {
        const h = heat[i] * 0.9885
        heat[i] = h
        if (Math.abs(h - written[i]) > 0.02) {
          written[i] = h
          cells[i].style.backgroundColor = heatCss(h)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onMove = (e) => {
    const grid = gridRef.current
    if (!grid || !readRef.current) return
    const rect = grid.getBoundingClientRect()
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * COLS)))
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)))
    readRef.current.textContent = `slot[${String(row).padStart(2, '0')},${String(col).padStart(2, '0')}] · resident`
  }

  const legend = useMemo(
    () => Array.from({ length: 24 }, (_, i) => heatCss(i / 23)),
    []
  )

  return (
    <div className="border border-zinc-800/70 bg-zinc-950/30 rounded-sm p-5 h-full flex flex-col" data-wear>
      <div className="flex items-baseline justify-between mb-6">
        <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">kv-cache residency</p>
        <p className="text-[9px] tabular text-zinc-700">64×36 · q8_0</p>
      </div>

      <div className="hm-wrap overflow-hidden cursor-crosshair" onMouseMove={onMove}>
        <div
          ref={gridRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1px)`,
            gridAutoRows: '1px',
            gap: '1px',
            transform: 'scale(3.25)',
            transformOrigin: 'top left',
            width: COLS * 2 - 1 + 'px',
          }}
        >
          {Array.from({ length: N }, (_, i) => (
            <div key={i} style={{ width: 1, height: 1 }} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-auto pt-6">
        <span className="text-[9px] text-zinc-700">evicted</span>
        <div className="flex flex-1">
          {legend.map((c, i) => (
            <div key={i} className="h-2 flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span className="text-[9px] text-zinc-700">resident</span>
      </div>
      <p ref={readRef} className="mt-4 text-[10px] text-zinc-600 font-mono min-h-[16px] tabular">
        simulated eviction front · write heads follow prefix affinity
      </p>
    </div>
  )
}

/* ——— token density strip ——— */

function TokenStrip() {
  const stripRef = useRef(null)

  useEffect(() => {
    const W = 64
    const buf = new Array(W).fill(2)
    let burst = 0
    const id = setInterval(() => {
      if (Math.random() < 0.07) burst = 5 + Math.random() * 3 // prefill burst
      burst *= 0.82
      const prev = buf[W - 1]
      const next = Math.max(0, Math.min(7, prev + (Math.random() - 0.48) * 2 + burst * 0.5))
      buf.push(next)
      buf.shift()
      if (stripRef.current)
        stripRef.current.textContent = buf.map((v) => GLYPHS[Math.round(v)] || '█').join('')
    }, 380)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="border border-zinc-800/70 bg-zinc-950/30 rounded-sm px-5 py-4 mt-5 flex items-center gap-5" data-wear>
      <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase whitespace-nowrap">
        token flux · live
      </p>
      <span ref={stripRef} className="tok-strip text-amber-500/60 text-[13px] font-mono overflow-hidden whitespace-nowrap" />
      <p className="text-[9px] tabular text-zinc-700 whitespace-nowrap hidden sm:block">64 samples · 380ms</p>
    </div>
  )
}

/* ——— section ——— */

export default function DataViz() {
  return (
    <section id="section-telemetry" className="border-b border-zinc-800/60 relative">
      <div className="max-w-6xl mx-auto px-6 py-28">
        <Reveal>
          <div className="flex items-end justify-between mb-16">
            <div>
              <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                Telemetry — DOM-native
              </p>
              <h2 className="mt-4 text-zinc-100 text-3xl md:text-4xl font-bold hero-title">
                Latency distribution &amp; token density.
              </h2>
              <p className="mt-3 text-[12px] text-zinc-500 max-w-lg leading-relaxed">
                Built from CSS grids and monospace block characters. No SVG, no canvas, no chart
                library shipped to your browser for two histograms.
              </p>
            </div>
            <span className="hidden md:block display text-[7rem] text-zinc-900/70 leading-none select-none">
              ▆▃█
            </span>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-12 gap-5">
          <Reveal className="lg:col-span-7 h-full" delay={0}>
            <Histogram />
          </Reveal>
          <Reveal className="lg:col-span-5 h-full" delay={120}>
            <Heatmap />
          </Reveal>
        </div>

        <Reveal delay={220}>
          <TokenStrip />
        </Reveal>
      </div>
    </section>
  )
}
