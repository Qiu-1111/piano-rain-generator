export type Hand = 'left' | 'right' | 'unknown'

export interface RainNote {
  id: string
  midi: number
  name: string
  start: number
  duration: number
  end: number
  hand: Hand
  velocity: number
}

export interface SongData {
  name: string
  duration: number
  notes: RainNote[]
  bpm: number
  timeSignature: [number, number]
}
