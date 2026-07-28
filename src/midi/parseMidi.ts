import { Midi } from '@tonejs/midi'
import type { Hand, RainNote, SongData } from '../types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  return NOTE_NAMES[midi % 12]
}

function guessHand(trackName: string, channel: number, midi: number, trackIndex: number, trackCount: number): Hand {
  const name = trackName.toLowerCase()
  if (
    name.includes('left') ||
    name.includes('lh') ||
    name.includes('左手') ||
    name.includes('bass') ||
    channel === 1
  ) {
    return 'left'
  }
  if (
    name.includes('right') ||
    name.includes('rh') ||
    name.includes('右手') ||
    name.includes('treble') ||
    name.includes('melody') ||
    channel === 0
  ) {
    return 'right'
  }

  // 多轨：按轨顺序猜（常见：轨0 右手 / 轨1 左手）
  if (trackCount >= 2) {
    if (trackIndex === 0) return 'right'
    if (trackIndex === 1) return 'left'
  }

  // 单轨：按音高粗分
  return midi < 60 ? 'left' : 'right'
}

export async function parseMidiFile(file: File): Promise<SongData> {
  const buffer = await file.arrayBuffer()
  const midi = new Midi(buffer)
  const notes: RainNote[] = []
  let id = 0

  const playableTracks = midi.tracks.filter((t) => t.notes.length > 0)

  playableTracks.forEach((track, trackIndex) => {
    track.notes.forEach((note) => {
      const hand = guessHand(
        track.name || '',
        track.channel,
        note.midi,
        trackIndex,
        playableTracks.length,
      )
      const start = note.time
      const duration = Math.max(note.duration, 0.05)
      notes.push({
        id: `n${id++}`,
        midi: note.midi,
        name: midiToNoteName(note.midi),
        start,
        duration,
        end: start + duration,
        hand,
        velocity: note.velocity,
      })
    })
  })

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi)

  const duration = Math.max(midi.duration, ...notes.map((n) => n.end), 1)
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]

  return {
    name: file.name.replace(/\.(mid|midi)$/i, ''),
    duration,
    notes,
    bpm,
    timeSignature: [ts[0] ?? 4, ts[1] ?? 4],
  }
}
