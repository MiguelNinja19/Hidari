"""Gera ícones nativos Hidari a partir de src/assets/logo.webp."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/assets/logo.webp"
OUT = ROOT / "hidari-icon-1024.png"
BG = (255, 255, 255)


def square_from_logo(size: int = 1024) -> Image.Image:
  """Encaixa a logo inteira num quadrado, sem cortar o emblema."""
  src = Image.open(SRC).convert("RGB")
  canvas = Image.new("RGB", (size, size), BG)

  pad = int(size * 0.08)
  inner = size - pad * 2
  ratio = min(inner / src.width, inner / src.height)
  w = max(1, int(round(src.width * ratio)))
  h = max(1, int(round(src.height * ratio)))
  fitted = src.resize((w, h), Image.Resampling.LANCZOS)
  ox = (size - w) // 2
  oy = (size - h) // 2
  canvas.paste(fitted, (ox, oy))
  return canvas


def main() -> None:
  if not SRC.exists():
    raise SystemExit(f"missing logo: {SRC}")
  icon = square_from_logo(1024)
  icon.save(OUT, "PNG", optimize=True)
  print("saved", OUT)
  print("run: npm run tauri icon hidari-icon-1024.png")


if __name__ == "__main__":
  main()
