import type { RainNote, SongData } from '../types'
import {
  buildKeyGeometry,
  fitRangeFromNotes,
  FULL_HIGHEST_MIDI,
  FULL_LOWEST_MIDI,
  getKey,
  isBlackKey,
  type KeyGeometry,
} from '../piano/layout'

const COLORS = {
  bg: '#1a1c1f',
  grid: 'rgba(255,255,255,0.06)',
  gridStrong: 'rgba(255,255,255,0.12)',
  right: '#e8922a',
  rightDark: '#c46f12',
  left: '#e07070',
  leftDark: '#b84848',
  unknown: '#8a9bb0',
  unknownDark: '#5a6b80',
  whiteKey: '#f2efe8',
  whiteKeyActive: '#f0a040',
  blackKey: '#1e2024',
  blackKeyActive: '#d47820',
  keyBorder: 'rgba(0,0,0,0.35)',
}

export class PianoRainRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private keys: KeyGeometry[] = []
  private song: SongData | null = null
  private currentTime = 0
  private pixelsPerSecond = 140
  private basePixelsPerSecond = 140
  private keyboardHeight = 110
  private dpr = 1
  private lookAhead = 0
  private activeNotes = new Set<number>()
  private lowestMidi = FULL_LOWEST_MIDI
  private highestMidi = FULL_HIGHEST_MIDI
  private cssWidth = 0
  private cssHeight = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D not supported')
    this.ctx = ctx
  }

  setSong(song: SongData | null) {
    this.song = song
    this.currentTime = 0
    this.activeNotes.clear()
    if (song?.notes.length) {
      const range = fitRangeFromNotes(song.notes.map((n) => n.midi))
      this.lowestMidi = range.lowest
      this.highestMidi = range.highest
    } else {
      this.lowestMidi = FULL_LOWEST_MIDI
      this.highestMidi = FULL_HIGHEST_MIDI
    }
    if (this.cssWidth > 0 && this.cssHeight > 0) {
      this.rebuildGeometry()
    }
  }

  setTime(t: number) {
    this.currentTime = Math.max(0, t)
    this.updateActiveKeys()
  }

  setPixelsPerSecond(pps: number) {
    this.basePixelsPerSecond = pps
    this.applyAdaptiveSpeed()
  }

  getLookAheadSeconds(): number {
    return this.lookAhead
  }

  resize(cssWidth: number, cssHeight: number) {
    const w = Math.max(1, Math.floor(cssWidth))
    const h = Math.max(1, Math.floor(cssHeight))
    this.cssWidth = w
    this.cssHeight = h
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.canvas.width = Math.floor(w * this.dpr)
    this.canvas.height = Math.floor(h * this.dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.rebuildGeometry()
  }

  private rebuildGeometry() {
    const w = this.cssWidth
    const h = this.cssHeight
    if (w <= 0 || h <= 0) return

    // 窄屏用更矮的键盘，给雨区留空间
    const khRatio = w < 640 ? 0.16 : w < 1024 ? 0.17 : 0.18
    this.keyboardHeight = Math.round(Math.max(72, Math.min(140, h * khRatio)))
    this.keys = buildKeyGeometry(w, this.lowestMidi, this.highestMidi)
    this.applyAdaptiveSpeed()
    this.lookAhead = Math.max(0.5, (h - this.keyboardHeight) / this.pixelsPerSecond)
  }

  /** 按画幅高度微调下落速度，保证预览秒数大致稳定 */
  private applyAdaptiveSpeed() {
    const rainH = Math.max(1, this.cssHeight - this.keyboardHeight)
    const targetPreview = this.cssWidth < 640 ? 3.2 : 4.2
    const adaptive = rainH / targetPreview
    // 用户滑条作基准，再与画幅自适应速度混合
    this.pixelsPerSecond = Math.max(60, Math.min(320, this.basePixelsPerSecond * 0.45 + adaptive * 0.55))
    this.lookAhead = rainH / this.pixelsPerSecond
  }

  private updateActiveKeys() {
    this.activeNotes.clear()
    if (!this.song) return
    const t = this.currentTime
    for (const note of this.song.notes) {
      if (note.midi < this.lowestMidi || note.midi > this.highestMidi) continue
      if (t >= note.start && t < note.end) {
        this.activeNotes.add(note.midi)
      }
    }
  }

  draw() {
    const w = this.cssWidth || this.canvas.clientWidth
    const h = this.cssHeight || this.canvas.clientHeight
    if (w <= 0 || h <= 0) return

    const ctx = this.ctx
    const hitY = h - this.keyboardHeight

    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, w, h)

    this.drawLanes(w, hitY)
    this.drawBeatLines(w, hitY)
    this.drawNotes(hitY)
    this.drawKeyboard(w, h, hitY)
    this.drawHitLine(w, hitY)
  }

  private drawLanes(w: number, hitY: number) {
    const ctx = this.ctx
    for (const key of this.keys) {
      if (key.isBlack) continue
      const strong = key.midi % 12 === 0
      ctx.strokeStyle = strong ? COLORS.gridStrong : COLORS.grid
      ctx.lineWidth = strong ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(key.x, 0)
      ctx.lineTo(key.x, hitY)
      ctx.stroke()
    }
    ctx.strokeStyle = COLORS.gridStrong
    ctx.beginPath()
    ctx.moveTo(w, 0)
    ctx.lineTo(w, hitY)
    ctx.stroke()
  }

  private drawBeatLines(w: number, hitY: number) {
    if (!this.song) return
    const ctx = this.ctx
    const beatDur = (60 / this.song.bpm) * (4 / this.song.timeSignature[1])
    const measureBeats = this.song.timeSignature[0]
    const startBeat = Math.floor(this.currentTime / beatDur) - 1
    const endBeat = Math.ceil((this.currentTime + this.lookAhead) / beatDur) + 1

    for (let b = startBeat; b <= endBeat; b++) {
      if (b < 0) continue
      const t = b * beatDur
      const y = hitY - (t - this.currentTime) * this.pixelsPerSecond
      if (y < -2 || y > hitY + 2) continue
      const isMeasure = b % measureBeats === 0
      ctx.strokeStyle = isMeasure ? COLORS.gridStrong : COLORS.grid
      ctx.lineWidth = isMeasure ? 1.25 : 0.75
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

  private noteColor(note: RainNote): { fill: string; dark: string } {
    if (note.hand === 'left') return { fill: COLORS.left, dark: COLORS.leftDark }
    if (note.hand === 'right') return { fill: COLORS.right, dark: COLORS.rightDark }
    return { fill: COLORS.unknown, dark: COLORS.unknownDark }
  }

  private drawNotes(hitY: number) {
    if (!this.song) return
    const ctx = this.ctx
    const t0 = this.currentTime
    const t1 = t0 + this.lookAhead + 0.5
    const visible = this.song.notes.filter(
      (n) =>
        n.end >= t0 - 0.05 &&
        n.start <= t1 &&
        n.midi >= this.lowestMidi &&
        n.midi <= this.highestMidi,
    )

    const sorted = [...visible].sort((a, b) => {
      const ab = isBlackKey(a.midi) ? 1 : 0
      const bb = isBlackKey(b.midi) ? 1 : 0
      return ab - bb
    })

    const compact = this.cssWidth < 640
    for (const note of sorted) {
      const key = getKey(this.keys, note.midi)
      if (!key) continue

      const bottomY = hitY - (note.start - t0) * this.pixelsPerSecond
      const topY = hitY - (note.end - t0) * this.pixelsPerSecond
      let y = topY
      let height = bottomY - topY
      const minH = key.isBlack ? 8 : 10
      if (height < minH) {
        height = minH
        y = bottomY - height
      }

      if (bottomY < 0 || topY > hitY) continue

      const pad = key.isBlack ? (compact ? 0.5 : 1) : compact ? 1.2 : 2.5
      const x = key.laneX + pad
      const width = Math.max(3, key.laneWidth - pad * 2)
      const radius = Math.min(6, width / 2, height / 2)
      const { fill, dark } = this.noteColor(note)

      const grad = ctx.createLinearGradient(x, y, x + width, y)
      grad.addColorStop(0, dark)
      grad.addColorStop(0.35, fill)
      grad.addColorStop(1, dark)

      ctx.save()
      this.roundRect(ctx, x, y, width, height, radius)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 1
      ctx.stroke()

      const showLabel = !compact && height >= 36 && width >= 14
      if (showLabel) {
        this.drawNoteLabel(ctx, note.name, x + width / 2, bottomY - 12, dark)
        if (height >= 70) {
          this.drawNoteLabel(ctx, note.name, x + width / 2, y + 12, dark)
        }
      }

      ctx.restore()
    }
  }

  private drawNoteLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    color: string,
  ) {
    const r = 9
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = '600 10px "DM Sans", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, cy + 0.5)
  }

  private drawHitLine(w: number, hitY: number) {
    const ctx = this.ctx
    const grad = ctx.createLinearGradient(0, hitY - 8, 0, hitY + 4)
    grad.addColorStop(0, 'rgba(232,146,42,0)')
    grad.addColorStop(0.7, 'rgba(232,146,42,0.45)')
    grad.addColorStop(1, 'rgba(232,146,42,0.8)')
    ctx.fillStyle = grad
    ctx.fillRect(0, hitY - 8, w, 12)
  }

  private drawKeyboard(w: number, h: number, hitY: number) {
    const ctx = this.ctx
    const kh = this.keyboardHeight
    const compact = this.cssWidth < 640
    const labelSize = compact ? 8 : keyLabelSize(this.keys)

    const shadow = ctx.createLinearGradient(0, hitY, 0, hitY + 16)
    shadow.addColorStop(0, 'rgba(0,0,0,0.45)')
    shadow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = shadow
    ctx.fillRect(0, hitY, w, 16)

    for (const key of this.keys) {
      if (key.isBlack) continue
      const active = this.activeNotes.has(key.midi)
      ctx.fillStyle = active ? COLORS.whiteKeyActive : COLORS.whiteKey
      ctx.fillRect(key.x, hitY, key.width, kh)
      ctx.strokeStyle = COLORS.keyBorder
      ctx.lineWidth = 1
      ctx.strokeRect(key.x + 0.5, hitY + 0.5, key.width - 1, kh - 1)

      if (active) {
        const g = ctx.createLinearGradient(0, hitY, 0, h)
        g.addColorStop(0, 'rgba(255,200,100,0.55)')
        g.addColorStop(1, 'rgba(240,160,64,0.15)')
        ctx.fillStyle = g
        ctx.fillRect(key.x, hitY, key.width, kh)
      }

      if (key.midi % 12 === 0 && key.width >= 12) {
        const octave = Math.floor(key.midi / 12) - 1
        ctx.fillStyle = active ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)'
        ctx.font = `500 ${labelSize}px "DM Sans", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`C${octave}`, key.x + key.width / 2, h - Math.max(4, kh * 0.08))
      }
    }

    const blackH = kh * 0.62
    for (const key of this.keys) {
      if (!key.isBlack) continue
      const active = this.activeNotes.has(key.midi)
      ctx.fillStyle = active ? COLORS.blackKeyActive : COLORS.blackKey
      this.roundRect(ctx, key.x, hitY, key.width, blackH, 3)
      ctx.fill()
      if (active) {
        ctx.fillStyle = 'rgba(255,180,80,0.35)'
        this.roundRect(ctx, key.x, hitY, key.width, blackH, 3)
        ctx.fill()
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      this.roundRect(ctx, key.x, hitY, key.width, blackH, 3)
      ctx.stroke()
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
  }
}

function keyLabelSize(keys: KeyGeometry[]): number {
  const white = keys.find((k) => !k.isBlack)
  if (!white) return 10
  if (white.width >= 22) return 10
  if (white.width >= 16) return 9
  return 8
}
