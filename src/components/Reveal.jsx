import { useInView } from '../hooks'

/**
 * Scroll-triggered reveal. Animates opacity + translate.
 * `delay` in ms, `duration` in ms. Fires once.
 */
export default function Reveal({ children, className = '', delay = 0, duration = 750 }) {
  const [ref, inView] = useInView()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(22px)',
        transition: `opacity ${duration}ms cubic-bezier(.16,1,.3,1) ${delay}ms, transform ${duration}ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Animated amber line that draws from center when scrolled into view.
 * The silence between sections — made visible.
 */
export function Divider({ className = '' }) {
  const [ref, inView] = useInView({ threshold: 0.5 })
  return (
    <div ref={ref} className={`max-w-6xl mx-auto px-6 ${className}`}>
      <div
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(245,158,11,.22) 30%, rgba(245,158,11,.22) 70%, transparent 100%)',
          transform: inView ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'transform 1.8s cubic-bezier(.16,1,.3,1)',
          transformOrigin: 'center',
        }}
      />
    </div>
  )
}
