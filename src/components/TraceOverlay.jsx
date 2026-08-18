import { useEffect, useRef, useState, useCallback } from 'react'

/* ——————————————————————————————————————————————
   Global trace command.
   Press ` anywhere, or type  >trace  on your
   keyboard without focusing anything.
   A 1px line drops. A routing waterfall flows.
   Four seconds. Then it retracts. No modal.
   —————————————————————————————————————————————— */

const TRACE_LINES = [
  { v: 'trace gen-ak2z91', t: 'head' },
  { v: '  req       POST /v1/chat/completions · model=nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B', t: 'dim' },
  { v: '  dns       0.4ms     apex-inference.xyz → 10.4.0.2', t: '' },
  { v: '  tls       8.2ms     tls1.3 · x25519 · resumption=1', t: '' },
  { v: '  edge      iad-02    [12ms]   HIT  prefix=sha1:9f2c…', t: 'ok' },
  { v: '  route     fra-01    [48ms]   slot=7/16  qd=0', t: 'ok' },
  { v: '  route     syd-01    [----]   TIMEOUT 300ms · probe dropped', t: 'bad' },
  { v: '  fallback  fra-01    [49ms]   re-affined key=k_8841', t: 'warn' },
  { v: '  prefill   9184 t/s  162184/184302 cached (0.88)', t: '' },
  { v: '  decode    itl 14.2ms · gbnf:tool_call.v3', t: '' },
  { v: '  total     ttft 118ms · exit 0', t: 'ok' },
]

const T_CLASS = {
  head: 'text-amber-500',
  dim: 'text-zinc-600',
  ok: 'text-zinc-300',
  bad: 'text-zinc-500',
  warn: 'text-amber-600',
  '': 'text-zinc-400',
}

export default function TraceOverlay() {
  const [stage, setStage] = useState('off') // off | drop | flow | retract
  const timers = useRef([])
  const active = useRef(false)

  const trigger = useCallback(() => {
    if (active.current) return
    active.current = true
    setStage('drop')
    const t = (fn, ms) => timers.current.push(setTimeout(fn, ms))
    t(() => setStage('flow'), 240)
    t(() => setStage('retract'), 4000)
    t(() => {
      setStage('off')
      active.current = false
    }, 4420)
  }, [])

  // hidden command listener — backtick or the literal sequence  >trace
  useEffect(() => {
    let buf = ''
    const h = (e) => {
      const tag = (e.target.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '`') {
        trigger()
        return
      }
      if (e.key.length === 1) {
        buf = (buf + e.key.toLowerCase()).slice(-6)
        if (buf === '>trace') {
          buf = ''
          trigger()
        }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [trigger])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  if (stage === 'off') return null

  return (
    <div className="trace-root" data-stage={stage} aria-hidden>
      <div className="trace-line" />
      <pre className="trace-panel">
        {TRACE_LINES.map((l, i) => (
          <div
            key={i}
            className={`tl ${T_CLASS[l.t]}`}
            style={{ animationDelay: `${120 + i * 120}ms` }}
          >
            {l.v}
          </div>
        ))}
      </pre>
    </div>
  )
}
