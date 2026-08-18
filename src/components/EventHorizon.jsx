import { useCallback, useEffect, useMemo, useRef } from 'react'
import Reveal from './Reveal.jsx'

const HEADER_WORDS = 16
const FRAME_WORDS = 12
const RING_FRAMES = 256
const BUFFER_BYTES = (HEADER_WORDS + FRAME_WORDS * RING_FRAMES) * 4

const REG = { SEQ: 2, WRITE_INDEX: 3, EPOCH: 4, STATE: 5, ROUTE: 6, EVENT_SEQ: 10 }
const STATE_NAMES = ['BOOT', 'NOMINAL', 'DEGRADED', 'FAILOVER', 'HEALING']
const ROUTE_NAMES = ['iad-02', 'fra-01']
const EVENT_CLASS = {
  dim: 'text-zinc-600',
  ok: 'text-zinc-400',
  warn: 'text-amber-600',
  bad: 'text-amber-500',
}

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const hex = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0')
const tabId = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0')

function formatRegisters(frame, seq, transport, role, peers, replayMs) {
  if (!frame) return 'waiting for first committed frame ...'
  const state = STATE_NAMES[frame[7]] || 'UNKNOWN'
  const route = ROUTE_NAMES[frame[6]] || 'unknown'
  const crcOk = frame.slice(0, 10).reduce((x, v) => x ^ v, 0) === frame[10]
  return [
    `memfd       apex.telemetry.v6     transport=${transport}`,
    `observer    ${role.padEnd(9)} peers=${String(peers).padStart(2, '0')}  read=${replayMs ? `t-${replayMs}ms` : 'live'}`,
    `seq         ${String(seq).padStart(10, '0')}        epoch=${String(frame[11]).padStart(4, '0')}`,
    `state       ${state.padEnd(10)}        route=${route}`,
    `ttft_us     ${String(frame[1]).padStart(10, ' ')}        itl_us=${String(frame[2]).padStart(6, ' ')}`,
    `cache_ppm   ${String(frame[3]).padStart(10, ' ')}        read_tok=${String(frame[8]).padStart(6, ' ')}`,
    `queue_milli ${String(frame[4]).padStart(10, ' ')}        slots=${String(frame[9]).padStart(3, ' ')}`,
    `decode_mts  ${String(frame[5]).padStart(10, ' ')}        crc=${hex(frame[10])} ${crcOk ? 'OK' : 'BAD'}`,
  ].join('\n')
}

/**
 * Phase 6. React mounts this component once. After mount, live telemetry,
 * cross-tab election, history reads, event logs, and commands are DOM-direct.
 */
export default function EventHorizon() {
  const rootRef = useRef(null)
  const regsRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const roleRef = useRef(null)
  const peerRef = useRef(null)
  const transportRef = useRef(null)
  const stateRef = useRef(null)
  const epochRef = useRef(null)
  const readRef = useRef(null)
  const tapeRef = useRef(null)
  const readHeadRef = useRef(null)
  const channelRefs = useRef([])
  const runtime = useRef(null)

  const cells = useMemo(() => Array.from({ length: RING_FRAMES }, (_, i) => i), [])

  const appendLog = useCallback((code, text, level = 'dim') => {
    const root = logRef.current
    if (!root) return
    const row = document.createElement('div')
    row.className = `eh-log-line ${EVENT_CLASS[level] || EVENT_CLASS.dim}`
    const stamp = (performance.now() / 1000).toFixed(3).padStart(8, ' ')
    row.textContent = `${stamp}  ${code.padEnd(9)} ${text}`
    root.appendChild(row)
    while (root.childElementCount > 10) root.firstElementChild.remove()
    root.scrollTop = root.scrollHeight
  }, [])

  useEffect(() => {
    const id = tabId()
    const canShare = window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
    const transport = canShare ? 'sab+atomics' : 'message-port'
    const buffer = canShare ? new SharedArrayBuffer(BUFFER_BYTES) : null
    const header = buffer ? new Int32Array(buffer, 0, HEADER_WORDS) : null
    const frames = buffer
      ? new Int32Array(buffer, HEADER_WORDS * 4, RING_FRAMES * FRAME_WORDS)
      : null
    const fallbackRing = Array(RING_FRAMES).fill(null)
    const meshRing = Array(RING_FRAMES).fill(null)

    let fallbackSeq = 0
    let remoteFrame = null
    let remoteSeq = 0
    let remoteAt = 0
    let lastRenderedSeq = -1
    let lastBroadcastAt = 0
    let replayOffset = null
    let replayPinned = false
    let pinnedPacket = null
    let role = 'primary'
    let peerCount = 1
    let stopped = false
    let apertureVisible = false
    let raf = 0
    const peers = new Map()

    const worker = new Worker(new URL('../event-horizon.worker.js', import.meta.url), {
      type: 'module',
      name: 'apex-telemetry-kernel',
    })

    if (transportRef.current) transportRef.current.textContent = transport
    appendLog('MAP', `${BUFFER_BYTES.toLocaleString('en-US')} bytes · ${transport}`, 'dim')

    const readLocal = (offset = 0) => {
      if (!header || !frames) {
        const idx = ((fallbackSeq - 1 - offset) % RING_FRAMES + RING_FRAMES) % RING_FRAMES
        const f = fallbackRing[idx]
        return f ? { frame: f, seq: fallbackSeq - offset, index: idx } : null
      }

      // Sequence lock: if the writer commits while we copy, try next frame.
      const before = Atomics.load(header, REG.SEQ)
      const latest = Atomics.load(header, REG.WRITE_INDEX)
      const index = (latest - offset + RING_FRAMES) % RING_FRAMES
      const base = index * FRAME_WORDS
      const frame = Array.from(frames.subarray(base, base + FRAME_WORDS))
      const after = Atomics.load(header, REG.SEQ)
      if (before !== after || frame[0] === 0) return null
      return { frame, seq: before - offset, index }
    }

    const readActive = (offset = 0) => {
      if (role === 'observer' && remoteFrame && performance.now() - remoteAt < 1400) {
        const index = ((remoteSeq - offset) % RING_FRAMES + RING_FRAMES) % RING_FRAMES
        const frame = meshRing[index]
        if (frame) return { frame, seq: remoteSeq - offset, index }
      }
      return readLocal(offset)
    }

    const channelValue = (frame, channel) => {
      if (channel === 0) return clamp((frame[1] / 1000 - 80) / 450)
      if (channel === 1) return clamp((frame[2] / 1000 - 10) / 28)
      if (channel === 2) return clamp((frame[3] - 550000) / 350000)
      return clamp(frame[4] / 10000)
    }

    const paintColumn = (frame, index) => {
      channelRefs.current.forEach((row, channel) => {
        const cell = row?.children[index]
        if (!cell) return
        const v = channelValue(frame, channel)
        const hot = frame[7] === 2 || frame[7] === 3
        cell.style.opacity = String(0.12 + v * 0.88)
        cell.style.backgroundColor = hot
          ? `rgba(234,88,12,${0.35 + v * 0.65})`
          : `rgba(245,158,11,${0.18 + v * 0.82})`
      })
    }

    const hydrateTape = () => {
      for (let offset = RING_FRAMES - 1; offset >= 0; offset--) {
        const packet = readActive(offset)
        if (packet?.frame) paintColumn(packet.frame, packet.index)
      }
    }

    const render = (packet, source = 'local') => {
      if (!packet?.frame) return
      const { frame, seq, index } = packet
      const replayMs = replayOffset == null ? 0 : Math.round(replayOffset * 33)
      if (regsRef.current)
        regsRef.current.textContent = formatRegisters(
          frame,
          seq,
          transport,
          role + (source === 'mesh' ? ':mesh' : ''),
          peerCount,
          replayMs
        )

      if (stateRef.current) {
        stateRef.current.textContent = STATE_NAMES[frame[7]] || 'UNKNOWN'
        stateRef.current.dataset.state = String(frame[7])
      }
      if (epochRef.current) epochRef.current.textContent = String(frame[11]).padStart(4, '0')
      if (readRef.current)
        readRef.current.textContent = replayMs
          ? `REPLAY -${(replayMs / 1000).toFixed(2)}s · crc ${hex(frame[10])}`
          : source === 'mesh'
            ? `MESH / primary:${routeLabel(frame[6])}`
            : 'LIVE / shared memory'
      if (rootRef.current) {
        rootRef.current.style.setProperty('--eh-pressure', clamp(frame[4] / 10000).toFixed(3))
        rootRef.current.dataset.health = String(frame[7])
      }

      if (replayOffset == null) paintColumn(frame, index)
      if (readHeadRef.current) {
        const x = (index / (RING_FRAMES - 1)) * 100
        readHeadRef.current.style.left = `calc(52px + (100% - 52px) * ${x / 100})`
      }
    }

    const routeLabel = (n) => ROUTE_NAMES[n] || 'unknown'

    worker.onmessage = (event) => {
      const msg = event.data || {}
      if (msg.type === 'event') appendLog(msg.code, msg.text, msg.level)
      if (msg.type === 'frame') {
        fallbackSeq = msg.seq
        fallbackRing[(msg.seq - 1) % RING_FRAMES] = msg.frame
      }
    }
    worker.postMessage({ type: 'init', buffer })

    // Cross-tab observer mesh. Lowest tab id is primary. Followers render the
    // primary's binary frame rather than pretending to own the control plane.
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('apex-observer-mesh-v6')
      : null

    const elect = () => {
      const now = Date.now()
      for (const [pid, seen] of peers) if (now - seen > 3200) peers.delete(pid)
      const candidates = [id, ...peers.keys()].sort()
      const next = candidates[0] === id ? 'primary' : 'observer'
      peerCount = candidates.length
      if (next !== role) {
        role = next
        appendLog('ELECT', `${role}; mesh peers=${peerCount}`, role === 'primary' ? 'ok' : 'dim')
      }
      if (roleRef.current) roleRef.current.textContent = role
      if (peerRef.current) peerRef.current.textContent = String(peerCount).padStart(2, '0')
    }

    if (channel) {
      channel.onmessage = (event) => {
        const msg = event.data || {}
        if (msg.id === id) return
        if (msg.type === 'hello') {
          peers.set(msg.id, Date.now())
          elect()
        }
        if (msg.type === 'frame' && role === 'observer') {
          remoteFrame = msg.frame
          remoteSeq = msg.seq
          remoteAt = performance.now()
          meshRing[msg.seq % RING_FRAMES] = msg.frame
        }
      }
    }

    const heartbeat = setInterval(() => {
      channel?.postMessage({ type: 'hello', id, role, at: Date.now() })
      elect()
    }, 1000)
    channel?.postMessage({ type: 'hello', id, role, at: Date.now() })

    const apertureObserver = new IntersectionObserver(
      ([entry]) => {
        apertureVisible = entry.isIntersecting
        if (apertureVisible) hydrateTape()
      },
      { rootMargin: '240px 0px' }
    )
    if (rootRef.current) apertureObserver.observe(rootRef.current)

    const frameLoop = (now) => {
      if (stopped) return
      let packet
      let source = 'local'

      if (replayOffset != null) {
        if (replayPinned && !pinnedPacket) pinnedPacket = readActive(replayOffset)
        packet = replayPinned && pinnedPacket ? pinnedPacket : readActive(replayOffset)
        source = 'replay'
      } else if (role === 'observer' && remoteFrame && now - remoteAt < 1400) {
        packet = { frame: remoteFrame, seq: remoteSeq, index: remoteSeq % RING_FRAMES }
        source = 'mesh'
      } else {
        packet = readLocal(0)
      }

      if (apertureVisible && packet && (packet.seq !== lastRenderedSeq || replayOffset != null)) {
        lastRenderedSeq = packet.seq
        render(packet, source)
      }

      if (role === 'primary' && channel && packet && now - lastBroadcastAt > 200) {
        lastBroadcastAt = now
        channel.postMessage({ type: 'frame', id, seq: packet.seq, frame: packet.frame })
      }
      raf = requestAnimationFrame(frameLoop)
    }
    raf = requestAnimationFrame(frameLoop)

    runtime.current = {
      worker,
      readLocal: readActive,
      get replayOffset() { return replayOffset },
      setReplay(offset, pinned = false) {
        replayOffset = offset
        replayPinned = pinned
        pinnedPacket = pinned && offset != null ? readActive(offset) : null
      },
      get replayPinned() { return replayPinned },
      setPinned(v) {
        replayPinned = v
        pinnedPacket = v && replayOffset != null ? readActive(replayOffset) : null
      },
      appendLog,
      id,
      transport,
    }

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      clearInterval(heartbeat)
      apertureObserver.disconnect()
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      channel?.close()
      window.dispatchEvent(new CustomEvent('apex:p99:clear'))
      runtime.current = null
    }
  }, [appendLog])

  const tapeMove = useCallback((e) => {
    const rt = runtime.current
    const tape = tapeRef.current
    if (!rt || !tape) return
    if (rt.replayPinned) return
    const rect = tape.getBoundingClientRect()
    const p = clamp((e.clientX - rect.left) / rect.width)
    const offset = Math.round((1 - p) * (RING_FRAMES - 1))
    rt.setReplay(offset, false)
    const packet = rt.readLocal(offset)
    if (packet?.frame) {
      window.dispatchEvent(new CustomEvent('apex:p99', { detail: { v: Math.round(packet.frame[1] / 1000) } }))
    }
  }, [])

  const tapeLeave = useCallback(() => {
    const rt = runtime.current
    if (!rt || rt.replayPinned) return
    rt.setReplay(null, false)
    window.dispatchEvent(new CustomEvent('apex:p99:clear'))
  }, [])

  const tapeClick = useCallback(() => {
    const rt = runtime.current
    if (!rt || rt.replayOffset == null) return
    const pinned = !rt.replayPinned
    rt.setPinned(pinned)
    rt.appendLog(pinned ? 'PIN' : 'LIVE', pinned ? `read head pinned at -${(rt.replayOffset * 0.033).toFixed(2)}s` : 'read head released', 'dim')
    if (!pinned) {
      rt.setReplay(null, false)
      window.dispatchEvent(new CustomEvent('apex:p99:clear'))
    }
  }, [])

  const runCommand = useCallback((raw) => {
    const rt = runtime.current
    if (!rt) return
    const [command = '', arg = ''] = raw.trim().toLowerCase().split(/\s+/, 2)
    if (!command) return
    rt.appendLog('CMD', raw.trim(), 'dim')

    if (command === 'help') {
      rt.appendLog('HELP', 'fault · replay [sec] · live · seed [hex] · fork · dump · clear', 'ok')
    } else if (command === 'fault') {
      rt.worker.postMessage({ type: 'fault', route: arg || 'iad-02' })
    } else if (command === 'replay') {
      const seconds = clamp(parseFloat(arg) || 4, 0.1, 8.4)
      rt.setReplay(Math.round(seconds * 30), true)
      rt.appendLog('REPLAY', `pinned ${seconds.toFixed(1)}s behind writer`, 'warn')
    } else if (command === 'live') {
      rt.setReplay(null, false)
      rt.setPinned(false)
      window.dispatchEvent(new CustomEvent('apex:p99:clear'))
      rt.appendLog('LIVE', 'read head attached to writer', 'ok')
    } else if (command === 'seed') {
      const seed = parseInt(arg.replace(/^0x/, ''), 16) || 0x41c6ce57
      rt.worker.postMessage({ type: 'reseed', seed })
    } else if (command === 'fork') {
      window.open(window.location.href, '_blank', 'noopener')
      rt.appendLog('FORK', 'new observer requested; mesh election pending', 'ok')
    } else if (command === 'dump') {
      const packet = rt.readLocal(rt.replayOffset || 0)
      if (packet) {
        navigator.clipboard.writeText(JSON.stringify({ seq: packet.seq, frame: packet.frame })).catch(() => {})
        rt.appendLog('DUMP', `frame ${packet.seq} copied as raw int32 json`, 'ok')
      }
    } else if (command === 'clear') {
      if (logRef.current) logRef.current.textContent = ''
    } else {
      rt.appendLog('ENOENT', `${command}: no such control verb`, 'bad')
    }
  }, [])

  const inputKey = useCallback((e) => {
    if (e.key !== 'Enter') return
    const value = e.currentTarget.value
    e.currentTarget.value = ''
    runCommand(value)
  }, [runCommand])

  return (
    <section id="section-horizon" className="eh-section border-b border-zinc-800/60 relative" ref={rootRef}>
      <div className="max-w-6xl mx-auto px-6 py-32">
        <Reveal>
          <div className="flex items-end justify-between mb-20">
            <div>
              <p className="section-label text-[10px] tracking-[0.25em] text-amber-500 uppercase">
                05 — Event Horizon
              </p>
              <h2 className="mt-4 text-zinc-100 text-3xl md:text-5xl font-bold hero-title">
                The page ends here.
              </h2>
              <p className="mt-4 text-[12px] text-zinc-500 max-w-2xl leading-relaxed">
                Worker-owned shared memory. Atomic commits. Deterministic failure and replay.
                Cross-tab primary election. React mounted the aperture and left the room.
              </p>
            </div>
            <span className="hidden md:block display text-[7rem] text-zinc-900/70 leading-none select-none">
              0x06
            </span>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="eh-plane border border-zinc-800/70 bg-black/40 rounded-sm overflow-hidden" data-wear>
            {/* kernel bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800/70 bg-zinc-950/60 text-[10px] font-mono tabular">
              <div className="flex items-center gap-4">
                <span className="text-zinc-500">/dev/apex-control</span>
                <span className="text-zinc-700">transport <span ref={transportRef} className="text-zinc-400">probing</span></span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-600">role <span ref={roleRef} className="text-amber-500">primary</span></span>
                <span className="text-zinc-600">peers <span ref={peerRef} className="text-zinc-300">01</span></span>
                <span className="text-zinc-600">epoch <span ref={epochRef} className="text-zinc-300">0001</span></span>
                <span ref={stateRef} className="eh-state text-amber-500" data-state="0">BOOT</span>
              </div>
            </div>

            <div className="grid lg:grid-cols-12">
              {/* memory-mapped registers */}
              <div className="lg:col-span-5 p-5 border-b lg:border-b-0 lg:border-r border-zinc-800/60">
                <p className="text-[9px] tracking-[0.2em] text-zinc-700 uppercase mb-4">register file · int32 little-endian</p>
                <pre ref={regsRef} className="text-[10.5px] leading-[1.85] text-zinc-400 tabular whitespace-pre-wrap min-h-[238px]">
                  waiting for worker ...
                </pre>
              </div>

              {/* binary event tape */}
              <div className="lg:col-span-7 p-5 relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[9px] tracking-[0.2em] text-zinc-700 uppercase">256-frame ring · hover to time travel · click to pin</p>
                  <p ref={readRef} className="text-[9px] tabular text-zinc-600">LIVE / shared memory</p>
                </div>

                <div
                  ref={tapeRef}
                  className="eh-tape relative cursor-crosshair py-2"
                  onPointerMove={tapeMove}
                  onPointerLeave={tapeLeave}
                  onClick={tapeClick}
                >
                  {['ttft', 'itl', 'cache', 'queue'].map((label, channel) => (
                    <div key={label} className="eh-channel flex items-center gap-3 mb-3 last:mb-0">
                      <span className="w-10 text-right text-[8px] tracking-wider text-zinc-700 uppercase">{label}</span>
                      <div
                        ref={(el) => { channelRefs.current[channel] = el }}
                        className="eh-channel-cells flex-1 grid"
                      >
                        {cells.map((i) => <i key={i} />)}
                      </div>
                    </div>
                  ))}
                  <div ref={readHeadRef} className="eh-read-head" />
                </div>

                <div className="mt-6 border-t border-zinc-800/60 pt-4">
                  <p className="text-[9px] tracking-[0.2em] text-zinc-700 uppercase mb-3">kernel event stream</p>
                  <div ref={logRef} className="eh-log text-[10px] leading-[1.7] font-mono tabular h-[112px] overflow-hidden" />
                </div>
              </div>
            </div>

            {/* command line */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/70 bg-zinc-950/50 font-mono text-[11px]">
              <span className="text-amber-600">root@observer</span>
              <span className="text-zinc-700">:</span>
              <span className="text-zinc-500">~#</span>
              <input
                ref={inputRef}
                className="eh-command flex-1"
                spellCheck={false}
                autoComplete="off"
                placeholder="help"
                onKeyDown={inputKey}
                aria-label="event horizon control command"
              />
              <span className="text-[9px] text-zinc-700 hidden sm:inline">fault · replay 4 · live · fork · dump</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-8 flex flex-col md:flex-row gap-3 md:items-center md:justify-between text-[10px] text-zinc-600 leading-relaxed">
            <p>
              Fast path: <span className="text-zinc-400">SharedArrayBuffer + Atomics.wait</span>. Fallback: MessagePort.
              No live frame crosses React state.
            </p>
            <p className="tabular text-zinc-700">{(BUFFER_BYTES / 1024).toFixed(2)} KiB · 256 snapshots · ~8.4s deterministic replay</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}