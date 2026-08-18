import { useEffect, useRef, useState, useCallback } from 'react'

/* ——————————————————————————————————————————————
   Real inference math. Deterministic. Blunt.
   —————————————————————————————————————————————— */
const TTFT_P99 = 0.389            // s
const MEAN_OUT = 512              // tokens
const TPS = 70.4                  // decode t/s per stream
const BATCH_GAIN = 4              // continuous batching multiplier
const MEAN_INFLIGHT = TTFT_P99 + MEAN_OUT / TPS   // ≈ 7.66s
const KV_PER_SLOT_GB = 2.1        // 32k effective ctx · q8_0 · 27-30B class
const IN_TOKENS = 8192
const PRICE_IN = 0.35             // $/M
const PRICE_OUT = 1.10            // $/M
const MONTH_SEC = 2592000

function compute(rps) {
  const conc = Math.ceil((rps * MEAN_INFLIGHT) / BATCH_GAIN)
  const kvGB = conc * KV_PER_SLOT_GB
  const tokens = rps * (IN_TOKENS + MEAN_OUT) * MONTH_SEC
  const cost = rps * MONTH_SEC * ((IN_TOKENS * PRICE_IN + MEAN_OUT * PRICE_OUT) / 1e6)
  return { conc, kvGB, tokens, cost }
}

const fmtKV = (gb) => (gb >= 1024 ? (gb / 1024).toFixed(1) + ' TB' : gb.toFixed(0) + ' GB')
const fmtMoney = (n) =>
  n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'k' : '$' + n.toFixed(0)

const KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const randKey = () =>
  'sk-apex-live-' + Array.from({ length: 24 }, () => KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]).join('')

function scramble(el, final, dur = 850) {
  const start = performance.now()
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur)
    const solved = Math.floor(p * final.length)
    let out = final.slice(0, solved)
    for (let i = solved; i < final.length; i++) out += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
    el.textContent = out
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/* key line — scrambles into place on mount */
function KeyLine({ k }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) scramble(ref.current, k)
  }, [k])
  return (
    <span className="term-line">
      <span className="text-zinc-500">api_key: </span>
      <span ref={ref} className="text-amber-400" />
    </span>
  )
}

export default function Handshake() {
  const [phase, setPhase] = useState('idle') // idle | streaming | done
  const [lines, setLines] = useState([])
  const inputRef = useRef(null)
  const outRef = useRef(null)
  const timers = useRef([])
  // scratch-panel refs — updated DOM-direct, zero re-renders while typing
  const cRef = useRef(null)
  const kvRef = useRef(null)
  const tokRef = useRef(null)
  const spRef = useRef(null)
  const lastRps = useRef(0)
  const lastKey = useRef('')

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [lines.length, phase])

  /* live pool math — writes straight to the scratch panel */
  const onInput = useCallback((e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
    if (e.target.value !== v) e.target.value = v
    const rps = parseInt(v, 10)
    const set = (ref, txt) => { if (ref.current) ref.current.textContent = txt }
    if (!rps || rps <= 0) {
      set(cRef, '—'); set(kvRef, '—'); set(tokRef, '—'); set(spRef, '—')
      return
    }
    const r = compute(rps)
    set(cRef, r.conc.toLocaleString('en-US'))
    set(kvRef, fmtKV(r.kvGB))
    set(tokRef, (r.tokens / 1e12).toFixed(1) + 'T tok/mo')
    set(spRef, fmtMoney(r.cost) + ' list')
  }, [])

  const runSequence = useCallback((rps) => {
    const r = compute(rps)
    const key = randKey()
    lastKey.current = key
    const curl = `curl -N https://api.apex-inference.xyz/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B","max_tokens":1048576,"stream":true,"messages":[{"role":"user","content":"ping"}]}'`

    setPhase('streaming')
    const seq = [
      { t: 'cmd', v: `> expected_rps: ${rps}` },
      { t: 'dim', v: '> sizing isolated pool ...' },
      { t: 'ok', v: `+ concurrency_isolation .... enabled (key-scoped, ${r.conc.toLocaleString('en-US')} slots)` },
      { t: 'ok', v: '+ slot_affinity ............ sha1(key_id + system_prompt)' },
      { t: 'ok', v: `+ kv_reservation ........... ${fmtKV(r.kvGB)} pinned · q8_0 · defrag_thold=0.10` },
      { t: 'ok', v: '+ scheduler ................ cont_batch=16 · fa_all_quants=1 · grammar=gbnf' },
      { t: 'key', v: key },
      { t: 'warn', v: 'warn: mock key. this page is a simulator. the math is not.' },
      { t: 'dim', v: 'test your pool:' },
      { t: 'curl', v: curl },
      { t: 'hint', v: '[enter] re-run · [esc] wipe · click a line to copy' },
    ]
    let delay = 120
    seq.forEach((line) => {
      const d = line.t === 'key' ? 420 : line.t === 'curl' ? 380 : line.t === 'hint' ? 300 : 210
      delay += d
      timers.current.push(
        setTimeout(() => {
          setLines((prev) => [...prev, line])
          if (line.t === 'hint') setPhase('done')
        }, delay)
      )
    })
  }, [])

  const submit = useCallback(() => {
    const rps = parseInt((inputRef.current?.value || '').replace(/\D/g, ''), 10)
    if (!rps || rps <= 0 || phase === 'streaming') return
    lastRps.current = rps
    setLines([])
    runSequence(rps)
  }, [phase, runSequence])

  const wipe = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setLines([])
    setPhase('idle')
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.focus()
    }
    const set = (ref) => { if (ref.current) ref.current.textContent = '—' }
    set(cRef); set(kvRef); set(tokRef); set(spRef)
  }, [])

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (phase === 'done') {
          setLines([])
          runSequence(lastRps.current)
        } else submit()
      }
      if (e.key === 'Escape') wipe()
    },
    [phase, submit, wipe, runSequence]
  )

  const copyClick = useCallback((e) => {
    const line = e.target.closest('.term-line')
    if (!line) return
    navigator.clipboard.writeText(line.textContent).catch(() => {})
    line.classList.remove('copied')
    void line.offsetWidth
    line.classList.add('copied')
  }, [])

  const lineClass = {
    cmd: 'text-zinc-300',
    dim: 'text-zinc-600',
    ok: 'text-zinc-400',
    warn: 'text-amber-500',
    hint: 'text-zinc-600',
  }

  return (
    <div className="grid lg:grid-cols-12 gap-5">
      {/* ——— console ——— */}
      <div
        className="lg:col-span-7 term-card rounded-sm overflow-hidden flex flex-col"
        data-wear
        onClick={() => { if (phase === 'idle') inputRef.current?.focus() }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-950/50">
          <span className="text-[11px] text-zinc-500 font-mono">
            ssh intake@apex-inference.xyz — pool provisioning
          </span>
          <span className="text-[10px] tabular text-zinc-600">
            handshake <span className="text-amber-500">v3</span>
          </span>
        </div>

        <div ref={outRef} className="term scan p-5 h-[400px] overflow-auto text-[11px] leading-[1.7] font-mono" onClick={copyClick}>
          <p className="text-zinc-600">no signup. no checkout. this is the form.</p>
          <p className="text-zinc-600 mb-4">type your expected rps. we do the arithmetic out loud.</p>

          {lines.map((l, i) => (
            <div key={i} className="hs-line">
              {l.t === 'key' ? (
                <KeyLine k={l.v} />
              ) : l.t === 'curl' ? (
                <pre className="term-line text-zinc-300 whitespace-pre-wrap">{l.v}</pre>
              ) : (
                <span className={`term-line ${lineClass[l.t] || 'text-zinc-400'}`}>{l.v}</span>
              )}
            </div>
          ))}

          {phase === 'idle' && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-zinc-500">&gt; expected_rps:</span>
              <input
                ref={inputRef}
                inputMode="numeric"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="hs-input"
                onInput={onInput}
                onKeyDown={onKeyDown}
                aria-label="expected requests per second"
              />
              <span className="cursor text-amber-500 pointer-events-none">▊</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/50 text-[10px] font-mono text-zinc-600">
          <span>{phase === 'idle' ? 'awaiting input' : phase === 'streaming' ? 'provisioning ...' : 'pool sized'}</span>
          <span className="tabular">
            exit <span className="text-amber-500">{phase === 'done' ? '0' : '—'}</span>
          </span>
        </div>
      </div>

      {/* ——— live pool math (DOM-direct scratch panel) ——— */}
      <div className="lg:col-span-5 border border-zinc-800/70 bg-zinc-950/30 rounded-sm p-5 flex flex-col">
        <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase mb-5">live pool math</p>

        <div className="space-y-4 text-[12px] font-mono">
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/50 pb-3">
            <span className="text-zinc-500">max_concurrency</span>
            <span ref={cRef} className="display text-amber-400 text-xl tabular">—</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/50 pb-3">
            <span className="text-zinc-500">kv_cache_allocation</span>
            <span ref={kvRef} className="display text-amber-400 text-xl tabular">—</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/50 pb-3">
            <span className="text-zinc-500">monthly_volume</span>
            <span ref={tokRef} className="display text-amber-400 text-xl tabular">—</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-zinc-500">estimated_monthly_spend</span>
            <span ref={spRef} className="display text-amber-400 text-xl tabular">—</span>
          </div>
        </div>

        <pre className="mt-auto pt-6 text-[10px] leading-[1.8] text-zinc-600 tabular">{`mean_inflight = ttft_p99(0.39s) + 512 tok / 70.4 t/s
              = ${MEAN_INFLIGHT.toFixed(2)}s per request
slots         = ceil(rps x ${MEAN_INFLIGHT.toFixed(2)} / ${BATCH_GAIN} batch)
kv per slot   = ${KV_PER_SLOT_GB} GB (32k eff ctx, q8_0)
price         = $${PRICE_IN}/M in, $${PRICE_OUT}/M out`}</pre>

        <p className="mt-4 text-[10px] text-zinc-600 leading-relaxed">
          list price. the volume curve is steep and negotiable.{' '}
          <span className="text-zinc-500">the math is the math.</span> actual pools:{' '}
          <a href="mailto:admin@apex-inference.xyz" className="text-amber-500 hover:text-amber-400 transition-colors">
            admin@apex-inference.xyz
          </a>
        </p>
      </div>
    </div>
  )
}
