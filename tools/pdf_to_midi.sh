#!/usr/bin/env bash
# PDF / 图片乐谱 → MusicXML → MIDI
# 依赖：Audiveris（/opt/audiveris/bin/Audiveris）+ Python music21
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <score.pdf|score.png> [输出目录]"
  exit 1
fi

INPUT="$(realpath "$1")"
OUT_DIR="${2:-$(pwd)/scores/converted}"
mkdir -p "$OUT_DIR"

AUDIVERIS="${AUDIVERIS_BIN:-/opt/audiveris/bin/Audiveris}"
if [[ ! -x "$AUDIVERIS" ]]; then
  echo "未找到 Audiveris：$AUDIVERIS"
  echo "Ubuntu: 安装 Audiveris deb；或本机安装后设置 AUDIVERIS_BIN"
  exit 1
fi

BASE="$(basename "$INPUT")"
STEM="${BASE%.*}"
WORK="$OUT_DIR/_work_$STEM"
mkdir -p "$WORK"

echo "==> Audiveris 识谱: $INPUT"
"$AUDIVERIS" -batch -export -output "$WORK" "$INPUT"

# 找导出的 MusicXML
XML="$(find "$WORK" -type f \( -iname '*.musicxml' -o -iname '*.xml' -o -iname '*.mxl' \) | head -n 1 || true)"
if [[ -z "${XML}" ]]; then
  echo "Audiveris 未产出 MusicXML，请检查谱面清晰度或改用 MuseScore 手动导出。"
  exit 2
fi

XML_OUT="$OUT_DIR/$STEM.musicxml"
MIDI_OUT="$OUT_DIR/$STEM.mid"
cp "$XML" "$XML_OUT"

echo "==> music21 转 MIDI: $XML_OUT"
python3 - <<PY
from music21 import converter
score = converter.parse(r"""$XML_OUT""")
score.write("midi", fp=r"""$MIDI_OUT""")
print("Wrote", r"""$MIDI_OUT""")
PY

echo ""
echo "完成："
echo "  MusicXML: $XML_OUT"
echo "  MIDI:     $MIDI_OUT"
echo "把 MIDI/MusicXML 上传到钢琴雨生成器即可。"
