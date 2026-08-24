/**
 * Runs inside youtube.com/embed/* frames — which is the whole point.
 *
 * A web page can't touch the audio of a cross-origin iframe; that's the browser's
 * same-origin boundary, not a YouTube rule. A content script, however, executes
 * as part of the frame's own origin, so the <video> element and its audio are
 * reachable here and nowhere else.
 *
 * This stays completely inert until the parent page identifies itself with our
 * message protocol, so YouTube embeds on every other site are untouched.
 */

;(() => {
  const CHANNEL = 'sp-transpose'

  // Pitch shifting by delay modulation ("Jungle"): two delay lines whose delay
  // times ramp linearly produce a constant Doppler shift, and crossfading
  // between them hides the discontinuity when each ramp resets. It's the
  // standard approach for live streams, where you can't process ahead.
  const BUFFER_TIME = 0.1
  const FADE_TIME = 0.05
  const DELAY_TIME = 0.1

  /** Envelope that fades one delay line in and out over its active window. */
  function createFadeBuffer(context) {
    const rate = context.sampleRate
    const activeLength = Math.floor(BUFFER_TIME * rate)
    const tailLength = Math.floor((BUFFER_TIME - 2 * FADE_TIME) * rate)
    const buffer = context.createBuffer(1, activeLength + tailLength, rate)
    const data = buffer.getChannelData(0)
    const fadeLength = FADE_TIME * rate
    const fadeOutStart = activeLength - fadeLength

    for (let i = 0; i < activeLength; i++) {
      if (i < fadeLength) data[i] = Math.sqrt(i / fadeLength)
      else if (i >= fadeOutStart) data[i] = Math.sqrt(1 - (i - fadeOutStart) / fadeLength)
      else data[i] = 1
    }
    // Remainder stays silent so the two lines alternate rather than overlap.
    return buffer
  }

  /** Sawtooth ramp driving a delay line — direction sets shift up vs down. */
  function createDelayTimeBuffer(context, shiftUp) {
    const rate = context.sampleRate
    const activeLength = Math.floor(BUFFER_TIME * rate)
    const tailLength = Math.floor((BUFFER_TIME - 2 * FADE_TIME) * rate)
    const total = activeLength + tailLength
    const buffer = context.createBuffer(1, total, rate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < activeLength; i++) {
      data[i] = shiftUp ? (activeLength - i) / total : i / activeLength
    }
    return buffer
  }

  function createShifter(context) {
    const input = context.createGain()
    const output = context.createGain()

    const downBuffer = createDelayTimeBuffer(context, false)
    const upBuffer = createDelayTimeBuffer(context, true)
    const fadeBuffer = createFadeBuffer(context)

    const loopSource = (buffer) => {
      const node = context.createBufferSource()
      node.buffer = buffer
      node.loop = true
      return node
    }

    // Two modulators per delay line: one for shifting down, one for up. Only
    // the pair matching the current direction is given any gain.
    const modDown1 = loopSource(downBuffer)
    const modDown2 = loopSource(downBuffer)
    const modUp1 = loopSource(upBuffer)
    const modUp2 = loopSource(upBuffer)

    const downGain1 = context.createGain()
    const downGain2 = context.createGain()
    const upGain1 = context.createGain()
    const upGain2 = context.createGain()
    upGain1.gain.value = 0
    upGain2.gain.value = 0

    modDown1.connect(downGain1)
    modDown2.connect(downGain2)
    modUp1.connect(upGain1)
    modUp2.connect(upGain2)

    // Scales how far the delay swings, which is what sets the interval.
    const depth1 = context.createGain()
    const depth2 = context.createGain()
    downGain1.connect(depth1)
    upGain1.connect(depth1)
    downGain2.connect(depth2)
    upGain2.connect(depth2)

    const delay1 = context.createDelay()
    const delay2 = context.createDelay()
    depth1.connect(delay1.delayTime)
    depth2.connect(delay2.delayTime)

    const fade1 = loopSource(fadeBuffer)
    const fade2 = loopSource(fadeBuffer)
    const mix1 = context.createGain()
    const mix2 = context.createGain()
    mix1.gain.value = 0
    mix2.gain.value = 0
    fade1.connect(mix1.gain)
    fade2.connect(mix2.gain)

    input.connect(delay1)
    input.connect(delay2)
    delay1.connect(mix1)
    delay2.connect(mix2)
    mix1.connect(output)
    mix2.connect(output)

    // The second line starts half a window later so their fades interleave.
    const start = context.currentTime + 0.05
    const stagger = start + BUFFER_TIME - FADE_TIME
    modDown1.start(start)
    modUp1.start(start)
    fade1.start(start)
    modDown2.start(stagger)
    modUp2.start(stagger)
    fade2.start(stagger)

    // The ramp sweeps the delay from 0 to `seconds` over BUFFER_TIME, and a
    // linearly ramping delay shifts pitch by 1 + (sweep / BUFFER_TIME). Since
    // DELAY_TIME and BUFFER_TIME are both 0.1, passing the full sweep makes
    // that come out at exactly 2^(semitones/12). Halving it here — as the
    // widely copied version of this algorithm does — delivered half the
    // interval, so every semitone sounded like a quarter tone.
    const setDepth = (seconds) => {
      const now = context.currentTime
      depth1.gain.setTargetAtTime(seconds, now, 0.01)
      depth2.gain.setTargetAtTime(seconds, now, 0.01)
    }

    return {
      input,
      output,
      setSemitones(semitones) {
        const ratio = Math.pow(2, semitones / 12) - 1
        const up = ratio > 0 ? 1 : 0
        downGain1.gain.value = 1 - up
        downGain2.gain.value = 1 - up
        upGain1.gain.value = up
        upGain2.gain.value = up
        setDepth(DELAY_TIME * Math.abs(ratio))
      },
    }
  }

  /* --------------------------------------------------------------- wiring -- */

  let graph = null // built once, on the first pitch request

  function build(video) {
    const context = new (window.AudioContext || window.webkitAudioContext)()
    // A media element can only ever be tapped once, so this must not be retried.
    const source = context.createMediaElementSource(video)

    const dry = context.createGain()
    const wet = context.createGain()
    wet.gain.value = 0

    const shifter = createShifter(context)
    source.connect(dry).connect(context.destination)
    source.connect(shifter.input)
    shifter.output.connect(wet).connect(context.destination)

    return { context, dry, wet, shifter }
  }

  function applyPitch(semitones) {
    // Nothing to do while we're at the original key and no graph exists yet.
    // Building one on page load would leave a muted shifter running on every
    // song of a setlist — six looping sources and two delay lines apiece — and
    // would tap the audio of videos that may never be transposed at all. The
    // parent still counts this as a success, so the slider becomes available.
    if (semitones === 0 && !graph) return true

    const video = document.querySelector('video')
    if (!video) return false

    if (!graph) {
      try {
        graph = build(video)
      } catch (err) {
        // If the tap fails we must not leave the element half-routed, or the
        // video would go silent with no way back.
        console.warn('[setlist-practice] could not attach to the audio:', err)
        graph = null
        return false
      }
    }

    if (graph.context.state === 'suspended') graph.context.resume()

    const bypass = semitones === 0
    // Straight through at zero, so unshifted playback keeps its original
    // quality rather than paying for a shifter doing nothing.
    graph.dry.gain.value = bypass ? 1 : 0
    graph.wet.gain.value = bypass ? 0 : 1
    if (!bypass) graph.shifter.setSemitones(semitones)
    return true
  }

  function announce() {
    if (window.parent === window) return
    window.parent.postMessage({ source: CHANNEL, type: 'ready' }, '*')
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.source !== CHANNEL) return

    if (data.type === 'ping') {
      announce()
      return
    }

    if (data.type === 'pitch') {
      const semitones = Number(data.semitones)
      if (!Number.isFinite(semitones)) return
      const ok = applyPitch(semitones)
      window.parent.postMessage(
        { source: CHANNEL, type: ok ? 'applied' : 'failed', semitones },
        '*'
      )
    }
  })

  announce()
})()
