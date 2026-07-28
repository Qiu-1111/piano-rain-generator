import { parseMidiFile } from './parseMidi'
import { parseMusicXmlFile } from './parseMusicXml'
import type { SongData } from '../types'

export type ScoreKind = 'midi' | 'musicxml' | 'mxl' | 'pdf' | 'unknown'

export function detectScoreKind(file: File): ScoreKind {
  const name = file.name.toLowerCase()
  if (name.endsWith('.mid') || name.endsWith('.midi')) return 'midi'
  if (name.endsWith('.mxl')) return 'mxl'
  if (name.endsWith('.musicxml') || name.endsWith('.xml')) return 'musicxml'
  if (name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'audio/midi' || file.type === 'audio/mid') return 'midi'
  if (file.type === 'application/pdf') return 'pdf'
  return 'unknown'
}

/**
 * 浏览器可直接解析：MIDI / MusicXML / MXL。
 * PDF 无法在浏览器内可靠识谱，需先转成 MIDI/MusicXML。
 */
export async function loadScoreFile(file: File): Promise<SongData> {
  const kind = detectScoreKind(file)

  if (kind === 'pdf') {
    throw new PdfNeedsConversionError(
      'PDF 五线谱需要先识谱转成 MIDI 或 MusicXML。请用 MuseScore 导出，或把 PDF 发到云端对话让我帮你转换。',
    )
  }

  if (kind === 'midi') return parseMidiFile(file)
  if (kind === 'musicxml' || kind === 'mxl') return parseMusicXmlFile(file)

  // 尝试按内容猜测
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const asText = new TextDecoder().decode(head)
  if (asText.startsWith('MThd')) return parseMidiFile(file)
  if (asText.includes('<?xml') || asText.includes('<score')) return parseMusicXmlFile(file)

  throw new Error('无法识别的曲谱格式，请上传 .mid / .musicxml / .mxl')
}

export class PdfNeedsConversionError extends Error {
  readonly code = 'PDF_NEEDS_CONVERSION' as const
  constructor(message: string) {
    super(message)
    this.name = 'PdfNeedsConversionError'
  }
}
