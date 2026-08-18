import { useEffect, useRef } from 'react'

/* ——————————————————————————————————————————————
   Temporal wear — phosphor burn-in.

   1. After 2 minutes the ambient glow degrades
      toward a warmer, burnt orange (staged at
      2m / 5m / 10m). A dedicated overlay div
      cross-fades over 9 seconds — zero layout
      impact, zero React state.

   2. Elements marked [data-wear] accumulate
      hover time in a WeakMap. Past thresholds
      they keep a 1-2% amber ghost of their
      hover state. Time on the page physically
      alters the UI.
   —————————————————————————————————————————————— */

export default function TemporalWear() {
  const phosRef = useRef(null)

  useEffect(() => {
    const t0 = Date.now()

    /* stage burn-in by elapsed time */
    const iv = setInterval(() => {
      const s = (Date.now() - t0) / 1000
      if (s > 120) document.body.classList.add('wear-1')
      if (s > 300) document.body.classList.add('wear-2')
      if (s > 600) document.body.classList.add('wear-3')
      if (phosRef.current) {
        phosRef.current.style.opacity = s > 600 ? '1' : s > 300 ? '0.7' : s > 120 ? '0.45' : '0'
      }
    }, 5000)

    /* hover ghosts */
    const counts = new WeakMap()
    const lastTs = new WeakMap()
    let raf = 0
    const onOver = (e) => {
      const el = e.target.closest && e.target.closest('[data-wear]')
      if (!el) return
      const now = Date.now()
      if ((lastTs.get(el) || 0) + 400 > now) return // throttle per element
      lastTs.set(el, now)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const n = (counts.get(el) || 0) + 1
        counts.set(el, n)
        if (n === 20) el.classList.add('worn-1')
        if (n === 50) el.classList.add('worn-2')
      })
    }
    document.addEventListener('mouseover', onOver)

    return () => {
      clearInterval(iv)
      document.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(raf)
      document.body.classList.remove('wear-1', 'wear-2', 'wear-3')
    }
  }, [])

  return <div ref={phosRef} className="phosphor" aria-hidden />
}
