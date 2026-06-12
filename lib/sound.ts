// Lightweight WebAudio beep, no asset needed.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function playBeep(volume = 0.4, frequency = 880, durationMs = 120) {
  const audio = getCtx()
  if (!audio) return
  if (audio.state === "suspended") void audio.resume()

  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = "sine"
  osc.frequency.value = frequency

  const now = audio.currentTime
  const vol = Math.max(0, Math.min(1, volume)) * 0.6
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(vol, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)

  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(now)
  osc.stop(now + durationMs / 1000 + 0.02)
}
