import './style.css'
import { Midi } from '@tonejs/midi'
import { parseMidiFile } from './midi/parseMidi'
import { PianoRainRenderer } from './render/PianoRainRenderer'
import { PianoPlayer } from './audio/PianoPlayer'
import type { SongData } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <h1>钢琴雨生成器</h1>
        <p>上传 MIDI，生成下落式钢琴雨 · 云端改动能同步</p>
      </div>
      <div class="actions">
        <label class="btn btn-primary file-btn">
          选择 MIDI 文件
          <input id="file-input" type="file" accept=".mid,.midi,audio/midi" />
        </label>
        <button class="btn" id="demo-btn" type="button">加载示例曲</button>
      </div>
    </header>

    <main class="stage-wrap">
      <div class="stage">
        <canvas id="rain-canvas"></canvas>
        <div class="empty" id="empty">
          <h2>把谱变成雨</h2>
          <p>手机 / 电脑都能改：上传 MIDI（.mid）即可。PDF 谱请先转成 MIDI。</p>
          <div class="legend">
            <span><i class="dot right"></i>右手</span>
            <span><i class="dot left"></i>左手</span>
          </div>
        </div>
      </div>
    </main>

    <footer class="controls">
      <div class="transport">
        <button class="btn btn-primary" id="play-btn" type="button" disabled>播放</button>
        <button class="btn" id="stop-btn" type="button" disabled>停止</button>
        <div class="meta" id="song-meta">尚未加载曲谱</div>
      </div>
      <div class="slider-row">
        <label for="speed">下落速度</label>
        <input id="speed" type="range" min="80" max="260" value="140" />
        <span class="time" id="speed-val">140</span>
      </div>
      <div class="progress">
        <span class="time" id="time-cur">0:00</span>
        <input id="seek" type="range" min="0" max="1000" value="0" disabled />
        <span class="time" id="time-total">0:00</span>
      </div>
    </footer>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#rain-canvas')!
const empty = document.querySelector<HTMLDivElement>('#empty')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const demoBtn = document.querySelector<HTMLButtonElement>('#demo-btn')!
const playBtn = document.querySelector<HTMLButtonElement>('#play-btn')!
const stopBtn = document.querySelector<HTMLButtonElement>('#stop-btn')!
const songMeta = document.querySelector<HTMLDivElement>('#song-meta')!
const speedInput = document.querySelector<HTMLInputElement>('#speed')!
const speedVal = document.querySelector<HTMLSpanElement>('#speed-val')!
const seekInput = document.querySelector<HTMLInputElement>('#seek')!
const timeCur = document.querySelector<HTMLSpanElement>('#time-cur')!
const timeTotal = document.querySelector<HTMLSpanElement>('#time-total')!

const renderer = new PianoRainRenderer(canvas)
const player = new PianoPlayer()

let song: SongData | null = null
let playing = false
let seeking = false
let raf = 0

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function resize() {
  const stage = canvas.parentElement!
  const rect = stage.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  renderer.setPixelsPerSecond(Number(speedInput.value))
  renderer.resize(w, h)
  renderer.draw()
}

function bindViewport() {
  const stage = canvas.parentElement!
  const ro = new ResizeObserver(() => resize())
  ro.observe(stage)

  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('scroll', resize)
  screen.orientation?.addEventListener?.('change', () => {
    requestAnimationFrame(resize)
  })
}

function setSong(next: SongData) {
  song = next
  player.setSong(next)
  renderer.setSong(next)
  empty.classList.add('hidden')
  playBtn.disabled = false
  stopBtn.disabled = false
  seekInput.disabled = false
  seekInput.value = '0'
  songMeta.innerHTML = `<strong>${escapeHtml(next.name)}</strong> · ${next.notes.length} 个音符 · ${Math.round(next.bpm)} BPM`
  timeTotal.textContent = formatTime(next.duration)
  timeCur.textContent = '0:00'
  playing = false
  playBtn.textContent = '播放'
  renderer.setTime(0)
  resize()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

async function loadFile(file: File) {
  try {
    songMeta.textContent = '正在解析 MIDI…'
    const data = await parseMidiFile(file)
    if (!data.notes.length) {
      songMeta.textContent = '未找到可播放音符，请换一个 MIDI 文件'
      return
    }
    setSong(data)
  } catch (err) {
    console.error(err)
    songMeta.textContent = 'MIDI 解析失败，请确认文件格式正确'
  }
}

async function togglePlay() {
  if (!song) return
  if (!playing) {
    const t = player.getCurrentTime()
    const from = t >= song.duration ? 0 : t
    await player.play(from)
    playing = true
    playBtn.textContent = '暂停'
    loop()
  } else {
    player.pause()
    playing = false
    playBtn.textContent = '播放'
    cancelAnimationFrame(raf)
    syncUiFromPlayer()
  }
}

function stop() {
  player.stop()
  playing = false
  playBtn.textContent = '播放'
  cancelAnimationFrame(raf)
  renderer.setTime(0)
  renderer.draw()
  seekInput.value = '0'
  timeCur.textContent = '0:00'
}

function syncUiFromPlayer() {
  if (!song || seeking) return
  const t = Math.min(player.getCurrentTime(), song.duration)
  renderer.setTime(t)
  renderer.draw()
  seekInput.value = String(Math.round((t / song.duration) * 1000))
  timeCur.textContent = formatTime(t)

  if (playing && t >= song.duration - 0.02) {
    playing = false
    playBtn.textContent = '播放'
    player.pause()
  }
}

function loop() {
  syncUiFromPlayer()
  if (playing) raf = requestAnimationFrame(loop)
}

/** 生成一段简短示例 MIDI（小星星片段） */
async function loadDemo() {
  const midi = new Midi()
  midi.header.setTempo(100)

  const right = midi.addTrack()
  right.name = 'Right Hand'
  right.channel = 0
  const left = midi.addTrack()
  left.name = 'Left Hand'
  left.channel = 1

  // 小星星旋律（右手）
  const melody: Array<[number, string, number]> = [
    [0, 'C5', 0.5],
    [0.5, 'C5', 0.5],
    [1, 'G5', 0.5],
    [1.5, 'G5', 0.5],
    [2, 'A5', 0.5],
    [2.5, 'A5', 0.5],
    [3, 'G5', 1],
    [4, 'F5', 0.5],
    [4.5, 'F5', 0.5],
    [5, 'E5', 0.5],
    [5.5, 'E5', 0.5],
    [6, 'D5', 0.5],
    [6.5, 'D5', 0.5],
    [7, 'C5', 1],
    [8, 'G5', 0.5],
    [8.5, 'G5', 0.5],
    [9, 'F5', 0.5],
    [9.5, 'F5', 0.5],
    [10, 'E5', 0.5],
    [10.5, 'E5', 0.5],
    [11, 'D5', 1],
    [12, 'G5', 0.5],
    [12.5, 'G5', 0.5],
    [13, 'F5', 0.5],
    [13.5, 'F5', 0.5],
    [14, 'E5', 0.5],
    [14.5, 'E5', 0.5],
    [15, 'D5', 1],
    [16, 'C5', 0.5],
    [16.5, 'C5', 0.5],
    [17, 'G5', 0.5],
    [17.5, 'G5', 0.5],
    [18, 'A5', 0.5],
    [18.5, 'A5', 0.5],
    [19, 'G5', 1],
    [20, 'F5', 0.5],
    [20.5, 'F5', 0.5],
    [21, 'E5', 0.5],
    [21.5, 'E5', 0.5],
    [22, 'D5', 0.5],
    [22.5, 'D5', 0.5],
    [23, 'C5', 1.5],
  ]
  for (const [time, name, duration] of melody) {
    right.addNote({ time, duration, name, velocity: 0.8 })
  }

  // 左手简单分解
  const bass: Array<[number, string, number]> = [
    [0, 'C3', 2],
    [2, 'F3', 1],
    [3, 'C3', 1],
    [4, 'F3', 2],
    [6, 'G3', 1],
    [7, 'C3', 1],
    [8, 'C3', 2],
    [10, 'F3', 1],
    [11, 'G2', 1],
    [12, 'C3', 2],
    [14, 'F3', 1],
    [15, 'G2', 1],
    [16, 'C3', 2],
    [18, 'F3', 1],
    [19, 'C3', 1],
    [20, 'F3', 2],
    [22, 'G3', 1],
    [23, 'C3', 1.5],
  ]
  for (const [time, name, duration] of bass) {
    left.addNote({ time, duration, name, velocity: 0.65 })
  }

  const bytes = midi.toArray()
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'audio/midi' })
  const file = new File([blob], '小星星.mid', { type: 'audio/midi' })
  await loadFile(file)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void loadFile(file)
  fileInput.value = ''
})

demoBtn.addEventListener('click', () => void loadDemo())
playBtn.addEventListener('click', () => void togglePlay())
stopBtn.addEventListener('click', stop)

speedInput.addEventListener('input', () => {
  const v = Number(speedInput.value)
  speedVal.textContent = String(v)
  renderer.setPixelsPerSecond(v)
  resize()
})

seekInput.addEventListener('pointerdown', () => {
  seeking = true
})

seekInput.addEventListener('input', () => {
  if (!song) return
  const t = (Number(seekInput.value) / 1000) * song.duration
  renderer.setTime(t)
  renderer.draw()
  timeCur.textContent = formatTime(t)
})

seekInput.addEventListener('pointerup', () => {
  if (!song) return
  const t = (Number(seekInput.value) / 1000) * song.duration
  player.seek(t)
  seeking = false
  if (playing) {
    void player.play(t).then(() => loop())
  } else {
    syncUiFromPlayer()
  }
})

seekInput.addEventListener('change', () => {
  // 键盘操作时也提交
  if (!seeking || !song) return
  const t = (Number(seekInput.value) / 1000) * song.duration
  player.seek(t)
  seeking = false
})

bindViewport()
resize()

// 空闲时也画一帧键盘
renderer.setSong(null)
renderer.draw()
