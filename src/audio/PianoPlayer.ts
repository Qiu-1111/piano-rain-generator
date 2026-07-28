import * as Tone from 'tone'
import type { RainNote, SongData } from '../types'

export class PianoPlayer {
  private synth: Tone.PolySynth | null = null
  private song: SongData | null = null
  private scheduled = false
  private part: Tone.Part | null = null

  async ensureReady() {
    await Tone.start()
    if (!this.synth) {
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        envelope: {
          attack: 0.005,
          decay: 0.3,
          sustain: 0.35,
          release: 0.8,
        },
        volume: -6,
      }).toDestination()
      this.synth.maxPolyphony = 64
    }
  }

  setSong(song: SongData | null) {
    this.disposePart()
    this.song = song
    this.scheduled = false
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    Tone.getTransport().bpm.value = song?.bpm ?? 120
  }

  private disposePart() {
    if (this.part) {
      this.part.dispose()
      this.part = null
    }
    this.scheduled = false
  }

  private schedule() {
    if (!this.song || !this.synth || this.scheduled) return
    const events = this.song.notes.map((n) => ({
      time: n.start,
      note: n,
    }))

    this.part = new Tone.Part((time, value: { note: RainNote }) => {
      const n = value.note
      const freq = Tone.Frequency(n.midi, 'midi').toFrequency()
      const vel = Math.max(0.2, Math.min(1, n.velocity))
      this.synth?.triggerAttackRelease(freq, n.duration, time, vel)
    }, events)

    this.part.start(0)
    this.scheduled = true
  }

  async play(fromTime = 0) {
    await this.ensureReady()
    this.disposePart()
    Tone.getTransport().stop()
    Tone.getTransport().seconds = fromTime
    this.schedule()
    Tone.getTransport().start()
  }

  pause() {
    Tone.getTransport().pause()
  }

  stop() {
    Tone.getTransport().stop()
    Tone.getTransport().seconds = 0
    this.synth?.releaseAll()
  }

  seek(seconds: number) {
    const wasStarted = Tone.getTransport().state === 'started'
    Tone.getTransport().seconds = seconds
    if (wasStarted) {
      this.disposePart()
      this.schedule()
    }
  }

  getCurrentTime(): number {
    return Tone.getTransport().seconds
  }

  getState(): 'started' | 'stopped' | 'paused' {
    return Tone.getTransport().state
  }

  setPlaybackRate(rate: number) {
    // Tone Transport 用 bpm 缩放近似变速
    if (!this.song) return
    Tone.getTransport().bpm.value = this.song.bpm * rate
  }

  dispose() {
    this.disposePart()
    this.synth?.dispose()
    this.synth = null
  }
}
