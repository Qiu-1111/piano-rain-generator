import type { Hand, RainNote, SongData } from '../types'
import { midiToNoteName } from './parseMidi'

const STEP_TO_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

function pitchToMidi(step: string, alter: number, octave: number): number {
  const pc = STEP_TO_PC[step.toUpperCase()]
  if (pc === undefined) return 60
  return (octave + 1) * 12 + pc + alter
}

function durationToSeconds(
  duration: number,
  divisions: number,
  tempoBpm: number,
  beatType: number,
): number {
  // MusicXML duration is in divisions per quarter note typically
  const quarterSeconds = 60 / tempoBpm
  const quarters = duration / Math.max(divisions, 1)
  // If beat type is not 4, tempo still usually refers to quarter in playback practice
  void beatType
  return Math.max(0.05, quarters * quarterSeconds)
}

function textContent(el: Element | null, fallback = ''): string {
  return el?.textContent?.trim() ?? fallback
}

function numContent(el: Element | null, fallback: number): number {
  const n = Number(textContent(el))
  return Number.isFinite(n) ? n : fallback
}

/**
 * 解析 MusicXML（partwise）为钢琴雨数据。
 * staff=1 / 高音谱 → 右手；staff=2 / 低音谱 → 左手。
 */
export function parseMusicXml(xmlText: string, name: string): SongData {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('MusicXML 解析失败')
  }

  let bpm = 120
  let beats = 4
  let beatType = 4
  const tempoEl = doc.querySelector('sound[tempo], metronome per-minute')
  if (tempoEl) {
    if (tempoEl.hasAttribute('tempo')) {
      bpm = Number(tempoEl.getAttribute('tempo')) || bpm
    } else {
      bpm = numContent(tempoEl, bpm)
    }
  }
  const perMinute = doc.querySelector('metronome per-minute')
  if (perMinute) bpm = numContent(perMinute, bpm)

  const beatsEl = doc.querySelector('time beats')
  const beatTypeEl = doc.querySelector('time beat-type')
  if (beatsEl) beats = numContent(beatsEl, beats)
  if (beatTypeEl) beatType = numContent(beatTypeEl, beatType)

  const notes: RainNote[] = []
  let id = 0

  const parts = Array.from(doc.querySelectorAll('part'))
  for (const part of parts) {
    let divisions = 1
    let currentTimeQuarters = 0
    // 备份：同一时刻多声部
    const backupStack: number[] = []

    for (const child of Array.from(part.children)) {
      if (child.tagName === 'measure') {
        for (const ev of Array.from(child.children)) {
          if (ev.tagName === 'attributes') {
            const div = ev.querySelector('divisions')
            if (div) divisions = numContent(div, divisions)
            const b = ev.querySelector('time beats')
            const bt = ev.querySelector('time beat-type')
            if (b) beats = numContent(b, beats)
            if (bt) beatType = numContent(bt, beatType)
            continue
          }

          if (ev.tagName === 'direction') {
            const sound = ev.querySelector('sound[tempo]')
            if (sound) bpm = Number(sound.getAttribute('tempo')) || bpm
            const pm = ev.querySelector('metronome per-minute')
            if (pm) bpm = numContent(pm, bpm)
            continue
          }

          if (ev.tagName === 'backup') {
            const d = numContent(ev.querySelector('duration'), 0)
            currentTimeQuarters -= d / Math.max(divisions, 1)
            backupStack.push(d)
            continue
          }

          if (ev.tagName === 'forward') {
            const d = numContent(ev.querySelector('duration'), 0)
            currentTimeQuarters += d / Math.max(divisions, 1)
            continue
          }

          if (ev.tagName !== 'note') continue

          const isChord = Boolean(ev.querySelector('chord'))
          const isRest = Boolean(ev.querySelector('rest'))
          const isGrace = Boolean(ev.querySelector('grace'))
          const durationDiv = numContent(ev.querySelector('duration'), 0)
          const durationQuarters = durationDiv / Math.max(divisions, 1)

          if (isGrace) continue

          if (!isChord) {
            // 非和弦音符占用时间轴（含休止符）
          }

          if (isRest) {
            if (!isChord) currentTimeQuarters += durationQuarters
            continue
          }

          const step = textContent(ev.querySelector('pitch step'), 'C')
          const alter = numContent(ev.querySelector('pitch alter'), 0)
          const octave = numContent(ev.querySelector('pitch octave'), 4)
          const midi = pitchToMidi(step, alter, octave)
          const staff = numContent(ev.querySelector('staff'), 1)
          const voice = textContent(ev.querySelector('voice'), '1')

          let hand: Hand = 'right'
          if (staff >= 2) hand = 'left'
          else if (staff === 1) hand = 'right'
          else hand = midi < 60 ? 'left' : 'right'

          // 某些谱用 voice 区分：voice 2/4 常为左手
          if (staff < 2 && (voice === '2' || voice === '4')) {
            // 仅当音高明显偏低时才改判，避免误伤右手内声部
            if (midi < 60) hand = 'left'
          }

          const start = currentTimeQuarters * (60 / bpm)
          const durationSec = durationToSeconds(durationDiv, divisions, bpm, beatType)

          notes.push({
            id: `x${id++}`,
            midi,
            name: midiToNoteName(midi),
            start,
            duration: durationSec,
            end: start + durationSec,
            hand,
            velocity: 0.75,
          })

          if (!isChord) currentTimeQuarters += durationQuarters
        }
      }
    }
  }

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi)
  const duration = Math.max(1, ...notes.map((n) => n.end), 0)

  return {
    name,
    duration,
    notes,
    bpm,
    timeSignature: [beats, beatType],
  }
}

export async function parseMusicXmlFile(file: File): Promise<SongData> {
  const name = file.name.replace(/\.(musicxml|xml|mxl)$/i, '')
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.mxl')) {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    // container.xml 指向主谱，否则取第一个 xml
    let xmlPath: string | null = null
    const container = zip.file(/META-INF\/container\.xml$/i)[0]
    if (container) {
      const cxml = await container.async('text')
      const cdoc = new DOMParser().parseFromString(cxml, 'application/xml')
      xmlPath = cdoc.querySelector('rootfile')?.getAttribute('full-path') ?? null
    }
    const entry =
      (xmlPath && zip.file(xmlPath)) ||
      zip.file(/\.(musicxml|xml)$/i).find((f) => !/META-INF/i.test(f.name)) ||
      null
    if (!entry) throw new Error('MXL 中未找到 MusicXML')
    const text = await entry.async('text')
    return parseMusicXml(text, name)
  }

  const text = await file.text()
  return parseMusicXml(text, name)
}
