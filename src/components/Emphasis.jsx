/**
 * Renders text with inline markup:
 *   __x__ → amber highlight
 *   `x`   → inline code
 */
export default function Emphasis({ text }) {
  const parts = text.split(/(__[^_]+__|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('__') && p.endsWith('__'))
          return <span key={i} className="text-amber-500">{p.slice(2, -2)}</span>
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="text-zinc-200 bg-zinc-900 px-1 py-0.5 rounded-sm text-[11px] border border-zinc-800/80">
              {p.slice(1, -1)}
            </code>
          )
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
