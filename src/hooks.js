import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * IntersectionObserver hook — fires once by default.
 */
export function useInView(options = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true)
          if (options.once !== false) obs.unobserve(el)
        }
      },
      {
        threshold: options.threshold ?? 0.08,
        rootMargin: options.rootMargin ?? '0px 0px -50px 0px',
      }
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [ref, inView]
}

/**
 * Critically-damped spring. No jank — single persistent rAF loop,
 * starts on demand, sleeps when settled.
 */
export function useSpring(target, stiffness = 0.08, damping = 0.82) {
  const [display, setDisplay] = useState(target)
  const state = useRef({ val: target, vel: 0 })
  const tRef = useRef(target)
  const sRef = useRef(stiffness)
  const dRef = useRef(damping)
  const rafId = useRef(null)
  const running = useRef(false)

  tRef.current = target
  sRef.current = stiffness
  dRef.current = damping

  const tick = useCallback(() => {
    const s = state.current
    const diff = tRef.current - s.val
    if (Math.abs(diff) < 0.005 && Math.abs(s.vel) < 0.005) {
      s.val = tRef.current
      s.vel = 0
      running.current = false
      setDisplay(tRef.current)
      return
    }
    s.vel = (s.vel + diff * sRef.current) * dRef.current
    s.val += s.vel
    setDisplay(s.val)
    rafId.current = requestAnimationFrame(tick)
  }, [])

  // kick when target moves
  useEffect(() => {
    if (!running.current) {
      running.current = true
      rafId.current = requestAnimationFrame(tick)
    }
  }, [target, tick])

  // cleanup
  useEffect(() => () => cancelAnimationFrame(rafId.current), [])

  return display
}
