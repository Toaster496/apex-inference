/*
 * Worker-owned telemetry microkernel.
 *
 * Fast path: a SharedArrayBuffer containing a 16-register header and a
 * 256-frame ring. The writer publishes with Atomics after each complete frame.
 * Fallback: the same binary frame is posted through MessagePort when cross-
 * origin isolation is unavailable.
 */

const HEADER_WORDS = 16
const FRAME_WORDS = 12
const RING_FRAMES = 256

const REG = {
  MAGIC: 0,
  VERSION: 1,
  SEQ: 2,
  WRITE_INDEX: 3,
  EPOCH: 4,
  STATE: 5,
  ROUTE: 6,
  SEED: 7,
  DROPPED: 8,
  UPTIME: 9,
  EVENT_SEQ: 10,
  CONTROL: 15,
}

const STATE = { BOOT: 0, NOMINAL: 1, DEGRADE: 2, FAILOVER: 3, HEAL: 4 }
const ROUTE = { IAD: 0, FRA: 1 }

let header = null
let frames = null
let shared = false
let running = false
let tick = 0
let epoch = 1
let lastState = -1
let manualFaultAt = -1
let seed = 0x41c6ce57

let telemetry = {
  ttft: 118000,
  itl: 14200,
  cache: 880000,
  queue: 0,
  tps: 70400,
  route: ROUTE.IAD,
  state: STATE.BOOT,
  cachedTokens: 162184,
  slots: 12,
}

function rng() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 4294967296
}

function emitEvent(code, text, level = 'dim') {
  if (header) Atomics.add(header, REG.EVENT_SEQ, 1)
  self.postMessage({ type: 'event', code, text, level, at: Math.round(performance.now()) })
}

function phaseForTick() {
  if (tick < 45) return STATE.BOOT

  if (manualFaultAt >= 0) {
    const age = tick - manualFaultAt
    if (age < 65) return STATE.DEGRADE
    if (age < 105) return STATE.FAILOVER
    if (age < 190) return STATE.HEAL
    manualFaultAt = -1
    return STATE.NOMINAL
  }

  // One deterministic incident every ~28 seconds. Long nominal gaps matter.
  const p = (tick - 45) % 840
  if (p < 560) return STATE.NOMINAL
  if (p < 625) return STATE.DEGRADE
  if (p < 670) return STATE.FAILOVER
  if (p < 755) return STATE.HEAL
  return STATE.NOMINAL
}

const TARGETS = {
  [STATE.BOOT]:     [164000, 18400, 510000, 2, 52000, ROUTE.IAD],
  [STATE.NOMINAL]:  [118000, 14200, 880000, 0, 70400, ROUTE.IAD],
  [STATE.DEGRADE]:  [278000, 23100, 735000, 5, 54800, ROUTE.IAD],
  [STATE.FAILOVER]: [492000, 31700, 618000, 9, 43800, ROUTE.FRA],
  [STATE.HEAL]:     [158000, 16600, 842000, 1, 66200, ROUTE.FRA],
}

function stateEvent(next) {
  if (next === lastState) return
  const previous = lastState
  lastState = next

  if (next === STATE.BOOT) emitEvent('BOOT', 'mapped telemetry fabric; zeroed 256 frame ring', 'dim')
  if (next === STATE.NOMINAL) {
    if (previous === STATE.HEAL) {
      telemetry.route = ROUTE.IAD
      epoch++
      emitEvent('HEALED', `iad-02 restored; epoch ${epoch}; no request loss`, 'ok')
    } else emitEvent('READY', 'scheduler converged; prefix affinity enabled', 'ok')
  }
  if (next === STATE.DEGRADE) emitEvent('DRIFT', 'iad-02 p99 outside control band; opening shadow route', 'warn')
  if (next === STATE.FAILOVER) emitEvent('FAILOVER', 'route compare-and-swap: iad-02 -> fra-01', 'bad')
  if (next === STATE.HEAL) emitEvent('HEAL', 'draining damaged epoch; replaying unacked sequence window', 'warn')
}

function approach(current, target, speed, noise) {
  return current + (target - current) * speed + (rng() - 0.5) * noise
}

function nextFrame() {
  const state = phaseForTick()
  stateEvent(state)
  const target = TARGETS[state]

  telemetry.state = state
  telemetry.route = state === STATE.HEAL ? ROUTE.FRA : target[5]
  telemetry.ttft = approach(telemetry.ttft, target[0], 0.075, 3800)
  telemetry.itl = approach(telemetry.itl, target[1], 0.08, 550)
  telemetry.cache = approach(telemetry.cache, target[2], 0.055, 8500)
  telemetry.queue = approach(telemetry.queue, target[3], 0.12, 0.3)
  telemetry.tps = approach(telemetry.tps, target[4], 0.07, 1500)
  telemetry.cachedTokens = Math.max(0, Math.round(184302 * telemetry.cache / 1000000))
  telemetry.slots = Math.max(1, Math.round(12 + telemetry.queue * 1.6))

  const frame = new Int32Array(FRAME_WORDS)
  frame[0] = Math.round(performance.now())
  frame[1] = Math.round(telemetry.ttft)
  frame[2] = Math.round(telemetry.itl)
  frame[3] = Math.round(telemetry.cache)
  frame[4] = Math.max(0, Math.round(telemetry.queue * 1000))
  frame[5] = Math.round(telemetry.tps)
  frame[6] = telemetry.route
  frame[7] = telemetry.state
  frame[8] = telemetry.cachedTokens
  frame[9] = telemetry.slots
  frame[10] = frame.slice(0, 10).reduce((x, v) => x ^ v, 0)
  frame[11] = epoch
  return frame
}

function publish(frame) {
  if (!shared) {
    self.postMessage({ type: 'frame', frame: Array.from(frame), seq: tick })
    return
  }

  const index = tick % RING_FRAMES
  const base = index * FRAME_WORDS
  frames.set(frame, base)

  // Publish only after the frame is complete. Readers use SEQ as a seqlock.
  Atomics.store(header, REG.WRITE_INDEX, index)
  Atomics.store(header, REG.EPOCH, epoch)
  Atomics.store(header, REG.STATE, frame[7])
  Atomics.store(header, REG.ROUTE, frame[6])
  Atomics.store(header, REG.SEED, seed | 0)
  Atomics.store(header, REG.UPTIME, frame[0])
  Atomics.add(header, REG.SEQ, 1)
}

function loop() {
  if (!running) return
  tick++
  publish(nextFrame())

  if (shared) {
    // The worker sleeps in the kernel. No timer churn on the main thread.
    Atomics.wait(header, REG.CONTROL, 0, 33)
    // Yield once so operator commands are not starved by a recursive microtask.
    setTimeout(loop, 0)
  } else {
    setTimeout(loop, 33)
  }
}

self.onmessage = (event) => {
  const msg = event.data || {}
  if (msg.type === 'init') {
    shared = Boolean(msg.buffer)
    if (shared) {
      header = new Int32Array(msg.buffer, 0, HEADER_WORDS)
      frames = new Int32Array(msg.buffer, HEADER_WORDS * 4, RING_FRAMES * FRAME_WORDS)
      Atomics.store(header, REG.MAGIC, 0x41504558)
      Atomics.store(header, REG.VERSION, 6)
      Atomics.store(header, REG.EPOCH, epoch)
    }
    running = true
    emitEvent('INIT', shared ? 'sab mapped; atomic writer online' : 'sab unavailable; message-port fallback online', 'dim')
    loop()
  }

  if (msg.type === 'fault') {
    manualFaultAt = tick
    emitEvent('OP', `operator injected fault into ${msg.route || 'iad-02'}`, 'warn')
  }

  if (msg.type === 'reseed') {
    seed = (msg.seed | 0) || 0x41c6ce57
    emitEvent('SEED', `deterministic seed set to 0x${(seed >>> 0).toString(16)}`, 'dim')
  }

  if (msg.type === 'stop') running = false
}