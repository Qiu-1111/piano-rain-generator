/** MIDI 21 (A0) ~ 108 (C8) — 标准 88 键 */
export const FULL_LOWEST_MIDI = 21
export const FULL_HIGHEST_MIDI = 108

export function isBlackKey(midi: number): boolean {
  const n = midi % 12
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10
}

/** 向下对齐到白键，保证键盘边缘好看 */
export function snapDownToWhite(midi: number): number {
  let m = Math.max(FULL_LOWEST_MIDI, midi)
  while (m > FULL_LOWEST_MIDI && isBlackKey(m)) m--
  return m
}

/** 向上对齐到白键 */
export function snapUpToWhite(midi: number): number {
  let m = Math.min(FULL_HIGHEST_MIDI, midi)
  while (m < FULL_HIGHEST_MIDI && isBlackKey(m)) m++
  return m
}

export function whiteKeyIndexInRange(midi: number, lowest: number): number {
  let count = 0
  for (let m = lowest; m < midi; m++) {
    if (!isBlackKey(m)) count++
  }
  return count
}

export function whiteKeyCountInRange(lowest: number, highest: number): number {
  return whiteKeyIndexInRange(highest + 1, lowest)
}

export interface KeyGeometry {
  midi: number
  isBlack: boolean
  x: number
  width: number
  laneX: number
  laneWidth: number
}

export function buildKeyGeometry(
  totalWidth: number,
  lowestMidi = FULL_LOWEST_MIDI,
  highestMidi = FULL_HIGHEST_MIDI,
): KeyGeometry[] {
  const lowest = Math.max(FULL_LOWEST_MIDI, Math.min(lowestMidi, highestMidi))
  const highest = Math.min(FULL_HIGHEST_MIDI, Math.max(lowestMidi, highestMidi))
  const whites = Math.max(1, whiteKeyCountInRange(lowest, highest))
  const whiteW = totalWidth / whites
  const blackW = whiteW * 0.58
  const keys: KeyGeometry[] = []

  for (let midi = lowest; midi <= highest; midi++) {
    const black = isBlackKey(midi)
    if (!black) {
      const wi = whiteKeyIndexInRange(midi, lowest)
      const x = wi * whiteW
      keys.push({
        midi,
        isBlack: false,
        x,
        width: whiteW,
        laneX: x,
        laneWidth: whiteW,
      })
    } else {
      const leftWhite = whiteKeyIndexInRange(midi + 1, lowest) - 1
      const leftEdge = (leftWhite + 1) * whiteW - blackW / 2
      keys.push({
        midi,
        isBlack: true,
        x: leftEdge,
        width: blackW,
        laneX: leftEdge,
        laneWidth: blackW,
      })
    }
  }

  return keys
}

export function getKey(keys: KeyGeometry[], midi: number): KeyGeometry | undefined {
  return keys.find((k) => k.midi === midi)
}

/** 根据曲目音域计算可视键盘范围（带边距） */
export function fitRangeFromNotes(
  midis: number[],
  padSemitones = 2,
): { lowest: number; highest: number } {
  if (!midis.length) {
    return { lowest: FULL_LOWEST_MIDI, highest: FULL_HIGHEST_MIDI }
  }
  const minN = Math.min(...midis)
  const maxN = Math.max(...midis)
  let lowest = snapDownToWhite(minN - padSemitones)
  let highest = snapUpToWhite(maxN + padSemitones)

  // 至少显示约两个八度，避免过窄
  const minSpan = 24
  while (highest - lowest < minSpan) {
    if (lowest > FULL_LOWEST_MIDI) lowest = snapDownToWhite(lowest - 1)
    if (highest - lowest >= minSpan) break
    if (highest < FULL_HIGHEST_MIDI) highest = snapUpToWhite(highest + 1)
    if (lowest === FULL_LOWEST_MIDI && highest === FULL_HIGHEST_MIDI) break
  }

  return { lowest, highest }
}
