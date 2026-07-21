"""Gera ícones nativos Hidari a partir de src/assets/logo.webp."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/assets/logo.webp"
OUT = ROOT / "hidari-icon-1024.png"
DOCS_OUT = ROOT / "docs/assets/hidari-logo.webp"
BG_RGB = (255, 255, 255)


def load_logo_rgba() -> Image.Image:
  return Image.open(SRC).convert("RGBA")


def square_from_logo(size: int = 1024) -> Image.Image:
  """Encaixa a logo num quadrado branco (ícone do SO)."""
  src = load_logo_rgba()
  canvas = Image.new("RGBA", (size, size), (*BG_RGB, 255))

  pad = int(size * 0.08)
  inner = size - pad * 2
  ratio = min(inner / src.width, inner / src.height)
  w = max(1, int(round(src.width * ratio)))
  h = max(1, int(round(src.height * ratio)))
  fitted = src.resize((w, h), Image.Resampling.LANCZOS)
  ox = (size - w) // 2
  oy = (size - h) // 2
  canvas.paste(fitted, (ox, oy), fitted)
  return canvas.convert("RGB")


def export_docs_logo() -> None:
  """Copia a logo oficial para a documentação (mantém transparência)."""
  DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
  src = load_logo_rgba()
  src.save(DOCS_OUT, "WEBP", quality=95, method=6)
  print("saved", DOCS_OUT)


def main() -> None:
  if not SRC.exists():
    raise SystemExit(f"missing logo: {SRC}")
  icon = square_from_logo(1024)
  icon.save(OUT, "PNG", optimize=True)
  print("saved", OUT)
  export_docs_logo()
  print("run: npm run icon:build")


if __name__ == "__main__":
  main()
