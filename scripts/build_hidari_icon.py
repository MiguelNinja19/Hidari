"""Gera ícones nativos Hidari a partir de src/assets/logo.webp."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/assets/logo.webp"
OUT = ROOT / "hidari-icon-1024.png"
DOCS_OUT = ROOT / "docs/assets/hidari-logo.webp"
DOCS_PNG = ROOT / "docs/assets/hidari-logo.png"
BG_RGB = (255, 255, 255)


def load_logo_rgba() -> Image.Image:
  return Image.open(SRC).convert("RGBA")


def cleaned_logo_rgba() -> Image.Image:
  """Remove fringe clara semi-transparente que fica feia em fundos escuros."""
  src = load_logo_rgba()
  px = src.load()
  w, h = src.size
  out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
  opx = out.load()
  for y in range(h):
    for x in range(w):
      r, g, b, a = px[x, y]
      lum = (r + g + b) / 3
      if a >= 200 or (a >= 130 and lum < 195):
        opx[x, y] = (r, g, b, 255)
  mask = out.getchannel("A")
  mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
  out.putalpha(mask)
  return out


def square_from_logo(size: int = 1024) -> Image.Image:
  """Encaixa a logo num quadrado branco (ícone do SO)."""
  src = cleaned_logo_rgba()
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
  """Logo do README/docs: touro sobre cartão branco arredondado (legível no dark mode)."""
  DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
  logo = cleaned_logo_rgba()
  pad = 48
  radius = 56
  canvas_size = max(logo.width, logo.height) + pad * 2

  scale = 3
  big = canvas_size * scale
  plate = Image.new("L", (big, big), 0)
  ImageDraw.Draw(plate).rounded_rectangle(
    (0, 0, big - 1, big - 1), radius=radius * scale, fill=255
  )
  plate = plate.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)

  out = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
  white = Image.new("RGBA", (canvas_size, canvas_size), (*BG_RGB, 255))
  out = Image.composite(white, out, plate)
  ox = (canvas_size - logo.width) // 2
  oy = (canvas_size - logo.height) // 2
  out.paste(logo, (ox, oy), logo)

  out.save(DOCS_OUT, "WEBP", quality=95, method=6)
  out.save(DOCS_PNG, "PNG", optimize=True)
  print("saved", DOCS_OUT)
  print("saved", DOCS_PNG)


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
