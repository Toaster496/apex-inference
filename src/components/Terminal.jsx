import { useEffect, useRef, useState, useCallback } from 'react'
import { TERM_LINES } from '../data.js'

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function color(s) {
  let h = esc(s)
  if (s.startsWith('>')) return '<span class="text-zinc-500">' + h + '</span>'
  if (s.startsWith('#')) return '<span class="text-zinc-600">' + h + '</span>'
  if (s.startsWith('$')) return '<span class="text-amber-500">' + h + '</span>'
  h = h.replace(/^data:/, '<span class="text-amber-500/80">data:</span>')
  h = h.replace(/&quot;/g, '"')
  h = h.replace(
    /"(cache_read_input_tokens|cached_tokens|cache_write_input_tokens|usage|tool_calls|finish_reason|prompt_tokens|completion_tokens|total_tokens|prompt_tokens_details|cost)"/g,
    '<span class="text-amber-400/90">"$1"</span>'
  )
  h = h.replace(
    /\b(162184|22118|184302|184359|57|118|14\.2|31\.7|70\.4|9184|0\.880|0\.0413|262144)\b/g,
    '<span class="text-amber-300">$1</span>'
  )
  h = h.replace(/\[DONE\]/, '<span class="text-amber-500 font-bold">[DONE]</span>')
  h = h.replace(/(\.{3,}) (\S+)/g, '$1 <span class="text-amber-500 tabular">$2</span>')
  h = h.replace(
    /x-apex-([\w-]+)/g,
    '<span class="text-zinc-400">x-apex-<span class="text-amber-400/80">$1</span></span>'
  )
  return h
}

function formatTime() {
  return new Date().toTimeString().slice(0, 8)
}

export default function Terminal({ active, onComplete }) {
  const [html, setHtml] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState(false)
  const preRef = useRef(null)
  const stateRef = useRef({ li: 0, ci: 0, buf: '', startTime: Date.now() })
  const timerRef = useRef(null)
  const elapsedRef = useRef(null)

  // click-to-copy
  const handleClick = useCallback((e) => {
    const line = e.target.closest('.term-line')
    if (!line) return
    const text = line.textContent
    navigator.clipboard.writeText(text).catch(() => {})
    line.classList.remove('copied')
    void line.offsetWidth
    line.classList.add('copied')
  }, [])

  useEffect(() => {
    if (!active) {
      clearTimeout(timerRef.current)
      clearInterval(elapsedRef.current)
      return
    }

    stateRef.current.startTime = Date.now()
    const cursor = '<span class="cursor text-amber-500">▊</span>'

    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - stateRef.current.startTime) / 1000))
    }, 500)

    const tick = () => {
      const st = stateRef.current
      if (st.li >= TERM_LINES.length) {
        setHtml(st.buf + cursor)
        setDone(true)
        if (onComplete) onComplete()
        return
      }
      const line = TERM_LINES[st.li]
      const isData = line.startsWith('data:')
      const isMetric = line.startsWith('  x-apex')
      const step = isData
        ? Math.max(8, Math.ceil(line.length / 10))
        : isMetric
          ? Math.max(4, Math.ceil(line.length / 14))
          : Math.max(3, Math.ceil(line.length / 24))
      st.ci += step
      const shown = line.slice(0, st.ci)

      // During typing, don't wrap in term-line yet (partial)
      setHtml(st.buf + color(shown) + cursor)

      if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight

      if (st.ci >= line.length) {
        // Completed line: wrap in interactive term-line span
        const isEmpty = line.trim() === ''
        st.buf += isEmpty
          ? '\n'
          : `<span class="term-line">${color(line)}</span>\n`
        st.li++
        st.ci = 0
        const pause = isEmpty ? 25 : isData ? 40 : isMetric ? 55 : 100
        timerRef.current = setTimeout(tick, pause)
      } else {
        timerRef.current = setTimeout(tick, isData ? 5 : isMetric ? 8 : 14)
      }
    }

    timerRef.current = setTimeout(tick, 500)
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(elapsedRef.current)
    }
  }, [active, onComplete])

  return (
    <div className="md:col-span-7">
      <div className="term-card rounded-sm overflow-hidden" data-wear>
        {/* chrome */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60 shadow-[0_0_6px_rgba(245,158,11,.5)]" />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
              curl — api.apex-inference.xyz
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono tabular">
            <span className="text-zinc-600 hidden sm:inline">{formatTime()}</span>
            <span className="text-zinc-600">
              <span className="text-zinc-500">t+</span>
              <span className="text-amber-500">{String(elapsed).padStart(3, '0')}s</span>
            </span>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <span className="pulse-dot" style={{ width: 4, height: 4 }} />
              {done ? 'DONE' : 'STREAM'}
            </span>
          </div>
        </div>

        {/* body */}
        <pre
          ref={preRef}
          className="term scan text-[11px] leading-[1.55] p-5 h-[440px] overflow-auto text-zinc-400 whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={handleClick}
        />

        {/* status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/50 text-[10px] font-mono text-zinc-600 tabular">
          <div className="flex items-center gap-3">
            <span>200 OK</span>
            <span className="text-zinc-800">·</span>
            <span>text/event-stream</span>
            <span className="text-zinc-800">·</span>
            <span>gzip</span>
          </div>
          <span className="text-zinc-500">
            exit <span className="text-amber-500">0</span>
          </span>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-zinc-600 flex items-center gap-2">
        <span className="text-amber-500/80">›</span>
        <span>hover to isolate. click to copy. raw SSE frames, nothing reformatted.</span>
      </p>
    </div>
  )
}
