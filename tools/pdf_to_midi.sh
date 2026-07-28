#!/usr/bin/env bash
# PDF / 图片乐谱 →（必要时缩小）→ Audiveris MusicXML → MIDI
# 依赖：Audiveris（/opt/audiveris/bin/Audiveris）+ Python3 + PyMuPDF + music21
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <score.pdf|page.png...> [输出目录]"
  exit 1
fi

INPUT="$(realpath "$1")"
OUT_DIR="${2:-$(pwd)/scores/converted}"
mkdir -p "$OUT_DIR"

AUDIVERIS="${AUDIVERIS_BIN:-/opt/audiveris/bin/Audiveris}"
if [[ ! -x "$AUDIVERIS" ]]; then
  echo "未找到 Audiveris：$AUDIVERIS"
  exit 1
fi

BASE="$(basename "$INPUT")"
STEM="${BASE%.*}"
WORK="$OUT_DIR/_work_$STEM"
PAGES="$OUT_DIR/_pages_$STEM"
mkdir -p "$WORK" "$PAGES"

INPUTS=()
if [[ "$INPUT" == *.pdf || "$INPUT" == *.PDF ]]; then
  echo "==> 将 PDF 渲染为适中分辨率 PNG（避免 Audiveris 拒绝超大图）"
  python3 - "$INPUT" "$PAGES" <<'PY'
import fitz, sys, os
src, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(src)
for i, page in enumerate(doc, 1):
    scale = 2200 / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    path = os.path.join(out_dir, f"page-{i:02d}.png")
    pix.save(path)
    print(path, pix.width, pix.height)
PY
  mapfile -t INPUTS < <(find "$PAGES" -name 'page-*.png' | sort)
else
  INPUTS=("$INPUT")
fi

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "没有可识谱的图片"
  exit 1
fi

echo "==> Audiveris 识谱 (${#INPUTS[@]} 页)"
"$AUDIVERIS" -batch -export -output "$WORK" "${INPUTS[@]}"

mapfile -t MXLS < <(find "$WORK" -type f \( -iname '*.mxl' -o -iname '*.musicxml' \) | sort)
if [[ ${#MXLS[@]} -eq 0 ]]; then
  echo "Audiveris 未产出 MusicXML，请检查谱面或改用 MuseScore。"
  exit 2
fi

XML_OUT="$OUT_DIR/$STEM.musicxml"
MIDI_OUT="$OUT_DIR/$STEM.mid"

echo "==> 合并 ${#MXLS[@]} 个分谱并导出 MIDI"
python3 - "$XML_OUT" "$MIDI_OUT" "${MXLS[@]}" <<'PY'
import sys
from pathlib import Path
from music21 import converter, stream, tempo, meter

xml_out, midi_out, *mxls = sys.argv[1:]
scores = [converter.parse(p) for p in mxls]

bpm = 80
for el in scores[0].recurse().getElementsByClass(tempo.MetronomeMark):
    if getattr(el, "number", None):
        bpm = el.number
        break

part = stream.Part(id="Piano")
part.insert(0, tempo.MetronomeMark(number=bpm))
part.insert(0, meter.TimeSignature("4/4"))

cursor = 0.0
for sc in scores:
    for n in sc.flatten().notes:
        part.insert(cursor + n.offset, n.transpose(0))
    cursor += sc.highestTime

merged = stream.Score()
merged.insert(0, part)
Path(xml_out).parent.mkdir(parents=True, exist_ok=True)
merged.write("musicxml", fp=xml_out)
merged.write("midi", fp=midi_out)
print("notes", len(list(merged.recurse().notes)), "ql", merged.highestTime, "bpm", bpm)
print("Wrote", xml_out)
print("Wrote", midi_out)
PY

echo ""
echo "完成："
echo "  MusicXML: $XML_OUT"
echo "  MIDI:     $MIDI_OUT"
