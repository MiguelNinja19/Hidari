"""Gera imagens BMP do instalador NSIS no estilo visual Hidari.

Requisitos Tauri / NSIS MUI:
  - header:  150 × 57
  - sidebar: 164 × 314

BMP não tem alpha — a logo (webp transparente) é composta no fundo escuro
antes de gravar, para não aparecer o quadrado branco.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "src/assets/logo.webp"
OUT_DIR = ROOT / "src-tauri/windows/nsis"
HEADER = OUT_DIR / "header.bmp"
SIDEBAR = OUT_DIR / "sidebar.bmp"

BG = (255, 255, 255)
TEXT = (20, 20, 20)


def load_logo_cropped() -> Image.Image:
  """Logo RGBA sem fundo, cortada ao bounding box opaco."""
  logo = Image.open(LOGO).convert("RGBA")
  # Limpa RGB em pixéis já transparentes (evita fringe branco no resize).
  px = logo.load()
  w, h = logo.size
  for y in range(h):
    for x in range(w):
      r, g, b, a = px[x, y]
      if a == 0:
        px[x, y] = (0, 0, 0, 0)
      elif a < 40 and r > 220 and g > 220 and b > 220:
        px[x, y] = (0, 0, 0, 0)

  bbox = logo.getbbox()
  if bbox:
    logo = logo.crop(bbox)
  return logo


def fit_logo(logo: Image.Image, max_w: int, max_h: int) -> Image.Image:
  ratio = min(max_w / logo.width, max_h / logo.height)
  size = (max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio)))
  return logo.resize(size, Image.Resampling.LANCZOS)


def paint_base(size: tuple[int, int]) -> Image.Image:
  """Fundo branco limpo (instalador NSIS)."""
  return Image.new("RGB", size, BG)


def composite_logo(base: Image.Image, logo: Image.Image, xy: tuple[int, int]) -> None:
  """Compõe logo transparente sobre RGB (sem quadrado branco)."""
  layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
  layer.paste(logo, xy, logo)
  composed = Image.alpha_composite(base.convert("RGBA"), layer)
  base.paste(composed.convert("RGB"))


def try_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
  candidates = [
    "segoeui.ttf",
    "SegoeUI.ttf",
    "arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ]
  if bold:
    candidates = [
      "C:/Windows/Fonts/seguisb.ttf",
      "C:/Windows/Fonts/arialbd.ttf",
      "arialbd.ttf",
    ] + candidates
  for name in candidates:
    try:
      return ImageFont.truetype(name, size)
    except OSError:
      continue
  return ImageFont.load_default()


def build_sidebar() -> Image.Image:
  w, h = 164, 314
  img = paint_base((w, h))

  # Só a logo, centrada — visual limpo no instalador.
  logo = fit_logo(load_logo_cropped(), 120, 150)
  ox = (w - logo.width) // 2
  oy = (h - logo.height) // 2
  composite_logo(img, logo, (ox, oy))
  return img


def build_header() -> Image.Image:
  img = paint_base((150, 57))
  logo = fit_logo(load_logo_cropped(), 40, 40)
  ox, oy = 10, (57 - logo.height) // 2
  composite_logo(img, logo, (ox, oy))

  draw = ImageDraw.Draw(img)
  font = try_font(15, bold=True)
  draw.text((ox + logo.width + 8, 18), "Hidari", fill=TEXT, font=font)
  return img


def save_bmp(img: Image.Image, path: Path) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  img.convert("RGB").save(path, format="BMP")
  print("saved", path)


def main() -> None:
  if not LOGO.exists():
    raise SystemExit(f"missing logo: {LOGO}")
  save_bmp(build_header(), HEADER)
  save_bmp(build_sidebar(), SIDEBAR)
  print("NSIS assets ready ->", OUT_DIR)


if __name__ == "__main__":
  main()
