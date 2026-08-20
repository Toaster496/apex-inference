import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useInView, useSpring } from './hooks.js'
import { MODELS, MODEL_DETAILS, INFRA, EDGES, MACHINE_DUMP } from './data.js'
import Terminal from './components/Terminal.jsx'
import Emphasis from './components/Emphasis.jsx'
import Toggle from './components/Toggle.jsx'
import Reveal, { Divider } from './components/Reveal.jsx'
import DataViz from './components/DataViz.jsx'
import Handshake from './components/Handshake.jsx'
import TraceOverlay from './components/TraceOverlay.jsx'
import TemporalWear from './components/TemporalWear.jsx'
import EventHorizon from './components/EventHorizon.jsx'

/* ——————————————————————————————————————————————
   Helper hooks
   —————————————————————————————————————————————— */

function useTicker(start, variance, period = 1400) {
  const [v, setV] = useState(start)
  useEffect(() => {
    const id = setInterval(() => {
      setV((p) => {
        const d = (Math.random() - 0.3) * variance
        return Number(Math.max(0, p + d).toFixed(2))
      })
    }, period + Math.random() * 300)
    return () => clearInterval(id)
  }, [variance, period])
  return v
}

function useLiveCounter(start, step = 13) {
  const [v, setV] = useState(start)
  useEffect(() => {
    const id = setInterval(() => {
      setV((p) => p + Math.floor(Math.random() * step) + 1)
    }, 900)
    return () => clearInterval(id)
  }, [step])
  return v
}

function useSectionTracker() {
  const [current, setCurrent] = useState('section-hero')
  useEffect(() => {
    const ids = ['section-hero', 'section-trust', 'section-telemetry', 'section-infra', 'section-roster', 'section-policy', 'section-cta', 'section-horizon']
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean)
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(e.target.id)
        }
      },
      { threshold: 0.15, rootMargin: '-48px 0px -35% 0px' }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return current
}

const SECTION_LABELS = {
  'section-hero': 'overview',
  'section-trust': 'live metrics',
  'section-telemetry': 'telemetry',
  'section-infra': '01 — infra',
  'section-roster': '02 — roster',
  'section-policy': '03 — policy',
  'section-cta': '04 — intake',
  'section-horizon': '05 — event horizon',
}

/* ——————————————————————————————————————————————
   DOM-direct components (no React re-renders)
   —————————————————————————————————————————————— */

function MouseGlow() {
  const ref = useRef(null)
  useEffect(() => {
    let raf
    const handler = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.background = `radial-gradient(650px circle at ${e.clientX}px ${e.clientY}px, rgba(245,158,11,.025), transparent 70%)`
        }
      })
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handler)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ref} className="fixed inset-0 pointer-events-none z-[1]" />
}

function ScrollProgress() {
  const ref = useRef(null)
  useEffect(() => {
    const handler = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      const p = total > 0 ? window.scrollY / total : 0
      if (ref.current) ref.current.style.transform = `scaleX(${p})`
    }
    window.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => window.removeEventListener('scroll', handler)
  }, [])
  return <div ref={ref} className="scroll-progress absolute bottom-0 left-0 w-full" />
}

/* ——————————————————————————————————————————————
   Model row with spring-driven TPS and
   hover-revealed detail line
   —————————————————————————————————————————————— */

function ModelRow({ model, detail, rawTps }) {
  const tps = useSpring(rawTps, 0.15, 0.7)
  const isMega = model[1] === '1m'

  return (
    <tr className="model-row group">
      <td className="p-3.5 pl-5">
        <span className="text-zinc-200 font-medium group-hover:text-white transition-colors duration-150">
          {model[0]}
        </span>
        <div className="model-detail">
          <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed font-normal">{detail}</p>
        </div>
      </td>
      <td className="p-3.5 tabular">
        {isMega ? (
          <span className="text-amber-400 font-semibold inline-flex items-center gap-1.5">
            {model[1]}
            <span className="mega-badge text-[8px] tracking-[0.15em] px-1.5 py-0.5 border border-amber-500/40 text-amber-400 bg-amber-500/5 rounded-sm leading-none">
              MEGA
            </span>
          </span>
        ) : (
          <span className="text-amber-500">{model[1]}</span>
        )}
      </td>
      <td className="p-3.5 tabular text-zinc-400">{model[2]}</td>
      <td className="p-3.5 tabular text-zinc-500">{model[3]}</td>
      <td className="p-3.5 tabular text-zinc-500">{model[4]}</td>
      <td className="p-3.5 tabular">
        <span className="text-zinc-300">{tps.toFixed(1)}</span>
        <span className="text-zinc-600 text-[10px] ml-1">t/s</span>
      </td>
      <td className="p-3.5 tabular text-zinc-500">{model[6]}</td>
      <td className="p-3.5 tabular">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shadow-[0_0_6px_rgba(245,158,11,.6)]" />
          <span className="text-zinc-400 text-[10px] tracking-wider">{model[7]}</span>
        </span>
      </td>
    </tr>
  )
}

function ModelTable() {
  const tpsValues = useRef(MODELS.map((m) => parseFloat(m[5])))
  const [, force] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      tpsValues.current = tpsValues.current.map((_, i) => {
        const base = parseFloat(MODELS[i][5])
        return base + (Math.random() - 0.5) * 4
      })
      force((n) => n + 1)
    }, 1600)
    return () => clearInterval(id)
  }, [])

  return (
    <tbody className="divide-y divide-zinc-800/60">
      {MODELS.map((m, i) => (
        <ModelRow key={m[0]} model={m} detail={MODEL_DETAILS[i]} rawTps={tpsValues.current[i]} />
      ))}
    </tbody>
  )
}

/* ——————————————————————————————————————————————
   Machine boot sequence — lines reveal one by
   one with variable timing per content type
   —————————————————————————————————————————————— */

function MachineView({ onToggle }) {
  const allLines = useMemo(() => MACHINE_DUMP.split('\n'), [])
  const [count, setCount] = useState(0)
  const [done, setDone] = useState(false)
  const preRef = useRef(null)

  useEffect(() => {
    let i = 0
    let timer
    const reveal = () => {
      if (i >= allLines.length) {
        setDone(true)
        return
      }
      const line = allLines[i]
      i++
      setCount(i)
      // variable timing — section headers slower, empty lines fast
      const delay =
        line.trim() === ''
          ? 8
          : line.startsWith('>>')
            ? 65
            : line.startsWith('[')
              ? 50
              : line.startsWith('  #')
                ? 35
                : 16
      timer = setTimeout(reveal, delay)
    }
    // initial dark pause before boot
    timer = setTimeout(reveal, 280)
    return () => clearTimeout(timer)
  }, [allLines])

  // auto-scroll to bottom as lines appear
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  }, [count])

  // colorize sections
  const rendered = allLines.slice(0, count).map((line, i) => {
    if (line.startsWith('>>')) return <span key={i} className="text-amber-600">{line + '\n'}</span>
    if (line.startsWith('[')) return <span key={i} className="text-amber-500">{line + '\n'}</span>
    if (line.trimStart().startsWith('#')) return <span key={i} className="text-zinc-600">{line + '\n'}</span>
    return <span key={i}>{line + '\n'}</span>
  })

  return (
    <>
      <pre ref={preRef} className="machine-dump">
        {rendered}
        <span className={`cursor ${done ? 'text-amber-500/50' : 'text-amber-500'}`}>▊</span>
      </pre>
      <Toggle machine onToggle={onToggle} />
    </>
  )
}

/* ——————————————————————————————————————————————
   Main app
   —————————————————————————————————————————————— */

export default function App() {
  const [machine, setMachine] = useState(false)
  const [glitching, setGlitching] = useState(false)
  const [edge, setEdge] = useState(EDGES[0])
  const [sessionTime, setSessionTime] = useState(0)
  const currentSection = useSectionTracker()
  const syncTime = useMemo(() => new Date().toISOString().slice(11, 19), [])

  // ——— open at the top, always ———
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  }, [])

  // ——— p99 metric bridge (histogram -> header, DOM-direct) ———
  const p99Ref = useRef(null)
  useEffect(() => {
    const set = (e) => {
      const el = p99Ref.current
      if (!el) return
      el.textContent = e.detail.v + 'ms'
      el.className = 'text-amber-400 transition-colors duration-150 tabular'
    }
    const clear = () => {
      const el = p99Ref.current
      if (!el) return
      el.textContent = '389ms'
      el.className = 'text-zinc-300 transition-colors duration-150 tabular'
    }
    window.addEventListener('apex:p99', set)
    window.addEventListener('apex:p99:clear', clear)
    return () => {
      window.removeEventListener('apex:p99', set)
      window.removeEventListener('apex:p99:clear', clear)
    }
  }, [])

  // trust band in-view (controls spring-from-zero animation)
  const [trustRef, trustInView] = useInView()

  // raw live counters
  const rawRequests = useLiveCounter(847291, 130)
  const rawTokens = useLiveCounter(42_800_000_000, 2_400_000)
  const rawTtft = useTicker(118, 6, 1800)
  const rawItl = useTicker(14.2, 1.2, 2100)
  const rawCache = useTicker(0.88, 0.02, 2600)

  // spring-smoothed display values
  const ttft = useSpring(rawTtft, 0.2, 0.65)
  const itl = useSpring(rawItl, 0.2, 0.65)
  const cache = useSpring(rawCache, 0.2, 0.65)
  // trust band springs from 0 when first scrolled into view
  const requests = useSpring(trustInView ? rawRequests : 0, 0.04, 0.94)
  const tokens = useSpring(trustInView ? rawTokens : 0, 0.04, 0.94)

  // session clock
  useEffect(() => {
    const id = setInterval(() => setSessionTime((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const fmtSession = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // edge rotation
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % EDGES.length
      setEdge(EDGES[i])
    }, 4200)
    return () => clearInterval(id)
  }, [])

  // bg sync
  useEffect(() => {
    document.body.style.background = machine ? '#000' : '#09090b'
    document.documentElement.style.background = machine ? '#000' : '#09090b'
  }, [machine])

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'm' || e.key === 'M') handleToggle()
      if (e.key === '1') document.getElementById('section-infra')?.scrollIntoView({ behavior: 'smooth' })
      if (e.key === '2') document.getElementById('section-roster')?.scrollIntoView({ behavior: 'smooth' })
      if (e.key === '3') document.getElementById('section-policy')?.scrollIntoView({ behavior: 'smooth' })
      if (e.key === 'Escape') window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // terminal completion — pulse the stat tiles
  const [termDone, setTermDone] = useState(false)
  const handleTermComplete = useCallback(() => setTermDone(true), [])

  // toggle with CRT glitch
  const handleToggle = useCallback(() => {
    if (machine) {
      setMachine(false)
      setGlitching(false)
      return
    }
    // glitch out, then switch
    setGlitching(true)
    setTimeout(() => {
      setMachine(true)
      setGlitching(false)
    }, 220)
  }, [machine])

  // ——— Machine view ———
  if (machine) {
    return (
      <>
        <MachineView onToggle={handleToggle} />
        <TraceOverlay />
      </>
    )
  }

  // ——— Human view ———
  return (
    <div className={`grain relative ${glitching ? 'glitch-out' : ''}`}>
      <MouseGlow />
      <TemporalWear />
      <div className="ambient-glow" aria-hidden />

      {/* ——— Header / status bar ——— */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 text-sm leading-none">▚</span>
            <span className="tracking-tight font-semibold text-zinc-200">APEX</span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span
              className="text-zinc-500 hidden sm:inline transition-all duration-300"
              key={currentSection}
            >
              {SECTION_LABELS[currentSection] || 'overview'}
            </span>
          </div>
          <div className="flex items-center gap-5 text-zinc-500 tabular">
            <span className="hidden lg:flex items-center gap-2 text-zinc-600">
              session <span className="sess-val text-zinc-400 transition-colors duration-1000">{fmtSession(sessionTime)}</span>
            </span>
            <span className="hidden md:flex items-center gap-2">
              <span className="text-zinc-600">edge</span>
              <span className="text-zinc-300">{edge}</span>
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <span className="text-zinc-600">p99</span>
              <span ref={p99Ref} className="text-zinc-300 transition-colors duration-150 tabular">389ms</span>
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <span className="text-zinc-600">up</span>
              <span className="text-zinc-300">99.<span className="text-amber-500">96</span></span>
            </span>
            <span className="flex items-center gap-2 text-amber-500/90">
              <span className="pulse-dot" />
              <span className="tracking-wider text-[10px]">SERVING</span>
            </span>
          </div>
        </div>
        <ScrollProgress />
      </header>

      {/* ——— Hero ——— */}
      <section id="section-hero" className="relative border-b border-zinc-800/60 overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 md:pt-32 md:pb-28 grid md:grid-cols-12 gap-12">
          <div className="md:col-span-5 relative z-10">
            <div className="fade-in inline-flex items-center gap-2 border border-zinc-800/80 bg-zinc-950/50 backdrop-blur px-3 py-1.5 text-[10px] tracking-widest text-zinc-400 mb-10">
              <span className="w-1 h-1 bg-amber-500" />
              OPENAI-COMPATIBLE · NO SDK REQUIRED
            </div>

            <h1 className="fade-in fade-in-2 hero-title text-zinc-100 font-bold text-[3.4rem] sm:text-[4.8rem] md:text-[5.4rem]">
              Open weights.
              <br />
              <span className="text-gradient">Served properly.</span>
            </h1>

            <p className="fade-in fade-in-3 mt-10 text-[13px] leading-[1.7] text-zinc-400 max-w-md">
              Most providers ship a quant they didn't test, cap context at 32k, and call it a
              day. We compile our own stack and read the token logprobs before anything goes
              public.
            </p>
            <p className="fade-in fade-in-3 mt-4 text-[13px] leading-[1.7] text-zinc-400 max-w-md">
              Drop-in{' '}
              <code className="text-zinc-200 bg-zinc-900 px-1.5 py-0.5 rounded-sm text-[12px] border border-zinc-800/80">
                /v1/chat/completions
              </code>
              . Streaming. Tool calls. Prefix caching that actually hits.
            </p>

            <div className="fade-in fade-in-4 mt-10 flex flex-wrap gap-3 text-xs">
              <a
                href="mailto:admin@apex-inference.xyz?subject=api%20key%20request"
                className="btn-primary px-6 py-3 rounded-sm text-xs font-semibold tracking-wide"
              >
                REQUEST API KEY →
              </a>
              <a
                href="#section-roster"
                className="btn-ghost px-6 py-3 rounded-sm text-xs tracking-wide"
              >
                MODEL ROSTER
              </a>
            </div>

            {/* live stat tiles */}
            <div
              data-wear
              className={`fade-in fade-in-4 mt-16 grid grid-cols-3 border border-zinc-800/80 rounded-sm overflow-hidden bg-zinc-950/40 backdrop-blur transition-shadow duration-700 ${termDone ? 'shadow-[0_0_20px_-6px_rgba(245,158,11,.25)]' : ''}`}
            >
              <div className="stat-tile p-4 border-r border-zinc-800/80">
                <dt className="text-[9px] tracking-[0.18em] text-zinc-600 uppercase">TTFT p50</dt>
                <dd className="display text-amber-400 text-[1.8rem] mt-2 tabular">
                  {ttft.toFixed(0)}
                  <span className="text-[10px] text-zinc-500 ml-0.5 font-mono">ms</span>
                </dd>
              </div>
              <div className="stat-tile p-4 border-r border-zinc-800/80">
                <dt className="text-[9px] tracking-[0.18em] text-zinc-600 uppercase">ITL p50</dt>
                <dd className="display text-amber-400 text-[1.8rem] mt-2 tabular">
                  {itl.toFixed(1)}
                  <span className="text-[10px] text-zinc-500 ml-0.5 font-mono">ms</span>
                </dd>
              </div>
              <div className="stat-tile p-4">
                <dt className="text-[9px] tracking-[0.18em] text-zinc-600 uppercase">CACHE HIT</dt>
                <dd className="display text-amber-400 text-[1.8rem] mt-2 tabular">
                  {cache.toFixed(2)}
                </dd>
              </div>
            </div>
          </div>

          <Terminal active={!machine} onComplete={handleTermComplete} />
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Trust band ——— */}
      <section id="section-trust" ref={trustRef} className="border-b border-zinc-800/60">
        <div
          className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8"
          style={{
            opacity: trustInView ? 1 : 0,
            transform: trustInView ? 'none' : 'translateY(16px)',
            transition: 'opacity 900ms cubic-bezier(.16,1,.3,1), transform 900ms cubic-bezier(.16,1,.3,1)',
          }}
        >
          <div>
            <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">Requests / 24h</p>
            <p className="display text-zinc-100 text-3xl md:text-4xl mt-2 tabular">
              {Math.round(requests).toLocaleString('en-US')}
            </p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">Tokens served</p>
            <p className="display text-zinc-100 text-3xl md:text-4xl mt-2 tabular">
              {(tokens / 1_000_000_000).toFixed(2)}
              <span className="text-amber-500 text-lg ml-1">B</span>
            </p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">Cold starts / 24h</p>
            <p className="display text-amber-500 text-3xl md:text-4xl mt-2 tabular">0</p>
          </div>
          <div>
            <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">Max context</p>
            <p className="display text-zinc-100 text-3xl md:text-4xl mt-2 tabular">
              1<span className="text-amber-500 text-lg ml-0.5">M</span>
            </p>
          </div>
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Telemetry (DOM-native data viz) ——— */}
      <DataViz />

      <Divider className="my-0" />

      {/* ——— Infrastructure ——— */}
      <section id="section-infra" className="border-b border-zinc-800/60 relative">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <div className="flex items-end justify-between mb-16">
              <div>
                <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                  01 — Infrastructure
                </p>
                <h2 className="mt-4 text-zinc-100 text-3xl md:text-4xl font-bold hero-title">
                  What we actually did.
                </h2>
              </div>
              <span className="hidden md:block display text-[7rem] text-zinc-900/70 leading-none select-none">
                01
              </span>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 border-t border-l border-zinc-800/70">
            {INFRA.map((item, idx) => (
              <Reveal key={item.title} delay={idx * 80} className="border-r border-b border-zinc-800/70">
                <div className="infra-card p-6 h-full relative" data-wear>
                  <div className="flex items-start justify-between mb-5">
                    <span className="text-[10px] tabular text-zinc-600 tracking-widest">
                      0{idx + 1}
                    </span>
                    <span className="w-6 h-px bg-amber-500/30 mt-2" />
                  </div>
                  <p className="text-zinc-100 text-[15px] font-medium leading-tight">{item.title}</p>
                  <p className="mt-4 text-[12px] text-zinc-500 leading-relaxed">
                    <Emphasis text={item.body} />
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={500}>
            <p className="mt-10 text-[11px] text-zinc-600 max-w-2xl leading-relaxed">
              We don't publish stack diagrams. What runs underneath is our problem. The numbers
              above are the contract.
            </p>
          </Reveal>
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Roster ——— */}
      <section id="section-roster" className="border-b border-zinc-800/60 relative">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <div className="flex items-end justify-between mb-16">
              <div>
                <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                  02 — Model Roster
                </p>
                <h2 className="mt-4 text-zinc-100 text-3xl md:text-4xl font-bold hero-title">
                  Active endpoints.
                </h2>
                <p className="mt-3 text-[12px] text-zinc-500 max-w-lg leading-relaxed">
                  Live right now. Pass the model ID verbatim into your existing OpenAI client.
                  Hover for detail.
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end gap-2">
                <span className="display text-[7rem] text-zinc-900/70 leading-none select-none">
                  02
                </span>
                <span className="text-[10px] tabular text-zinc-600">
                  sync <span className="text-amber-500">{syncTime}</span> UTC
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="border border-zinc-800/70 rounded-sm overflow-hidden bg-zinc-950/30 backdrop-blur" data-wear>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[760px]">
                  <thead className="text-[9px] tracking-[0.18em] uppercase text-zinc-600 border-b border-zinc-800/70 bg-zinc-950/50">
                    <tr>
                      <th className="text-left font-normal p-3.5 pl-5">Model ID</th>
                      <th className="text-left font-normal p-3.5">CTX</th>
                      <th className="text-left font-normal p-3.5">Quant</th>
                      <th className="text-left font-normal p-3.5">KV</th>
                      <th className="text-left font-normal p-3.5">Tools</th>
                      <th className="text-left font-normal p-3.5">TPS p50</th>
                      <th className="text-left font-normal p-3.5">Tag</th>
                      <th className="text-left font-normal p-3.5">State</th>
                    </tr>
                  </thead>
                  <ModelTable />
                </table>
              </div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-5 text-[10px] text-zinc-600 flex items-center gap-2">
              <span className="text-amber-500/80">›</span>
              Model IDs are upstream verbatim. We don't rename things to look tidy.
            </p>
          </Reveal>
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Policies ——— */}
      <section id="section-policy" className="border-b border-zinc-800/60 relative">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <div className="flex items-end justify-between mb-16">
              <div>
                <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                  03 — Policy
                </p>
                <h2 className="mt-4 text-zinc-100 text-3xl md:text-4xl font-bold hero-title">
                  What we don't do.
                </h2>
              </div>
              <span className="hidden md:block display text-[7rem] text-zinc-900/70 leading-none select-none">
                03
              </span>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5" data-wear>
            <Reveal delay={0}>
              <div className="policy-card p-7 rounded-sm h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 border border-amber-500/25 bg-amber-500/5 flex items-center justify-center">
                    <span className="text-amber-500 text-lg leading-none">∅</span>
                  </div>
                  <p className="text-zinc-100 text-base font-medium">Zero retention</p>
                </div>
                <p className="text-[13px] text-zinc-400 leading-relaxed">
                  We don't store prompts.{' '}
                  <span className="text-amber-400 font-medium">/dev/null.</span>
                </p>
                <p className="mt-3 text-[12px] text-zinc-500 leading-relaxed">
                  No completion logging. No training set. Request bodies live in memory for the
                  duration of the request and are gone. What we keep: timestamp, model id, token
                  counts, status code. That's the billing row. Nothing else fits in it.
                </p>
                <pre className="mt-5 text-[10.5px] text-zinc-500 border border-zinc-800/70 bg-black/30 p-4 rounded-sm overflow-x-auto tabular leading-relaxed">
{`log_prompts        = `}<span className="text-amber-500">false</span>{`
log_completions    = `}<span className="text-amber-500">false</span>{`
retention_seconds  = `}<span className="text-amber-500">0</span>{`
train_on_user_data = `}<span className="text-amber-500">false</span>
                </pre>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="policy-card p-7 rounded-sm h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 border border-amber-500/25 bg-amber-500/5 flex items-center justify-center">
                    <span className="text-amber-500 text-lg leading-none">⟳</span>
                  </div>
                  <p className="text-zinc-100 text-base font-medium">Day-zero drops</p>
                </div>
                <p className="text-[13px] text-zinc-400 leading-relaxed">
                  We spin up new open-weights in{' '}
                  <span className="text-amber-400 font-medium">hours, not weeks.</span>
                </p>
                <p className="mt-3 text-[12px] text-zinc-500 leading-relaxed">
                  Someone is watching the HF firehose. Quant, eval pass, chat template sanity
                  check, endpoint live. If the template is broken on release we fix it locally
                  and mention it in the changelog instead of serving garbage.
                </p>
                <pre className="mt-5 text-[10.5px] text-zinc-500 border border-zinc-800/70 bg-black/30 p-4 rounded-sm overflow-x-auto tabular leading-relaxed">
{`median_time_to_serve = `}<span className="text-amber-500">5h41m</span>{`
n_day0_launches_2026 = `}<span className="text-amber-500">23</span>{`
template_patches     = `}<span className="text-amber-500">9</span>
                </pre>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Intake handshake (replaces the mailto CTA) ——— */}
      <section id="section-cta" className="border-b border-zinc-800/60 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <div className="flex items-end justify-between mb-16">
              <div>
                <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                  04 — Intake
                </p>
                <h2 className="mt-4 text-zinc-100 text-3xl md:text-4xl font-bold hero-title">
                  Provision a pool.
                </h2>
                <p className="mt-3 text-[12px] text-zinc-500 max-w-lg leading-relaxed">
                  Aggregators: give us an RPS number. The sizing arithmetic runs out loud —
                  concurrency, KV allocation, monthly spend. Then you get a key and a curl.
                </p>
              </div>
              <span className="hidden md:block display text-[7rem] text-zinc-900/70 leading-none select-none">
                04
              </span>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <Handshake />
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-8 text-[11px] text-zinc-600 max-w-2xl leading-relaxed">
              This is a simulator. Keys are mock. The pool math is the same math our scheduler
              runs. For a real isolated pool — volume pricing, per-key concurrency, SLA text in
              plain English — mail{' '}
              <a href="mailto:admin@apex-inference.xyz" className="text-amber-500 hover:text-amber-400 transition-colors">
                admin@apex-inference.xyz
              </a>
              . No discovery call.
            </p>
          </Reveal>
        </div>
      </section>

      <Divider className="my-0" />

      {/* ——— Worker-owned control plane ——— */}
      <EventHorizon />

      {/* ——— Footer ——— */}
      <footer className="relative">
        <div className="max-w-6xl mx-auto px-6 py-14 pb-36 flex flex-col md:flex-row md:items-center justify-between gap-6 text-[11px] text-zinc-600">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 text-sm leading-none">▚</span>
            <span className="text-zinc-400 font-semibold tracking-tight">APEX INFERENCE</span>
            <span className="text-zinc-800">—</span>
            <span>apex-inference.xyz</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
            <a href="/privacy.html" className="hover:text-amber-500 transition-colors">Privacy</a>
            <a href="/terms.html" className="hover:text-amber-500 transition-colors">Terms</a>
            <a href="mailto:admin@apex-inference.xyz" className="hover:text-amber-500 transition-colors">
              admin@apex-inference.xyz
            </a>
            <span className="text-zinc-800 hidden md:inline">|</span>
            <span className="flex items-center gap-2 tabular">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              all systems nominal
            </span>
            <span className="text-zinc-800 hidden md:inline">|</span>
            <span className="hidden md:flex items-center gap-1.5 text-zinc-700">
              <span className="kbd">m</span>
              <span className="kbd">1</span>
              <span className="kbd">2</span>
              <span className="kbd">3</span>
              <span className="kbd">esc</span>
              <span className="kbd">`</span>
              <span className="text-zinc-800">trace</span>
            </span>
          </div>
        </div>
      </footer>

      <Toggle machine={false} onToggle={handleToggle} />
      <TraceOverlay />
    </div>
  )
}
