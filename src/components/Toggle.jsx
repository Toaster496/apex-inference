export default function Toggle({ machine, onToggle }) {
  return (
    <div
      className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50"
      style={{ opacity: machine ? 0.85 : 1 }}
    >
      <div className="relative">
        {/* glow halo */}
        <div
          className="absolute -inset-1 rounded-sm blur-md transition-opacity duration-500"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(245,158,11,.3), transparent 70%)',
            opacity: machine ? 0.7 : 0.3,
          }}
          aria-hidden
        />
        <button
          onClick={onToggle}
          className="relative flex items-center gap-3 border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl px-4 py-2.5 text-[10px] tracking-[0.2em] font-mono hover:border-amber-500/30 transition-colors rounded-sm shadow-[0_8px_24px_-8px_rgba(0,0,0,.8)]"
          aria-label="Toggle view mode"
        >
          <span className={`transition-colors duration-200 ${machine ? 'text-zinc-600' : 'text-amber-400 font-semibold'}`}>
            HUMAN
          </span>

          <span className="w-11 h-[18px] border border-zinc-700 rounded-sm relative inline-block bg-zinc-900/80 overflow-hidden">
            <span
              className="absolute top-[1px] w-[14px] h-[14px] bg-gradient-to-b from-amber-400 to-amber-600 rounded-[2px] transition-all duration-200 ease-[cubic-bezier(.16,1,.3,1)] shadow-[0_0_10px_rgba(245,158,11,.6)]"
              style={{ left: machine ? '26px' : '2px' }}
            />
          </span>

          <span className={`transition-colors duration-200 ${machine ? 'text-amber-400 font-semibold' : 'text-zinc-600'}`}>
            MACHINE
          </span>
        </button>
      </div>
    </div>
  )
}
