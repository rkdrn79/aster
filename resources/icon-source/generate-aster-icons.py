#!/usr/bin/env python3
"""Generate every Aster brand asset from one six-armed asterisk.

Writes resources/build/aster.{png,icns,ico}, resources/logo.svg, the macOS menu-bar template
images, and the web client's home-screen icons. Requires Pillow; the .icns step needs macOS
iconutil.
"""
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

RESOURCES = Path(__file__).resolve().parents[1]
BUILD = RESOURCES / 'build'
TRAY = RESOURCES / 'tray'
WEB = RESOURCES.parent / 'src' / 'renderer' / 'web-public'

# Proportions of the approved mark, as fractions of the square it sits on.
ARM_REACH = 0.295
STROKE = 0.088
ARM_ANGLES = [90 + step * 60 for step in range(6)]
SUPERSAMPLE = 4

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def draw_asterisk(draw: ImageDraw.ImageDraw, cx: float, cy: float, body: float, color) -> None:
    reach, width = ARM_REACH * body, STROKE * body
    radius = width / 2
    for angle in ARM_ANGLES:
        x = cx + reach * math.cos(math.radians(angle))
        y = cy - reach * math.sin(math.radians(angle))
        draw.line([(cx, cy), (x, y)], fill=color, width=round(width))
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color)


def render(size: int, margin: float, corner: float) -> Image.Image:
    """A white asterisk on a black rounded square; margin/corner are fractions of size."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), CLEAR)
    draw = ImageDraw.Draw(image)
    inset = margin * big
    body = big - 2 * inset
    draw.rounded_rectangle([inset, inset, big - inset, big - inset], radius=corner * body, fill=BLACK)
    draw_asterisk(draw, big / 2, big / 2, body, WHITE)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def render_glyph(size: int, color) -> Image.Image:
    """The bare mark filling its canvas, for template and inline uses."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), CLEAR)
    extent = 2 * ARM_REACH + STROKE
    draw_asterisk(ImageDraw.Draw(image), big / 2, big / 2, big / extent, color)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def mac_icon(size: int) -> Image.Image:
    # Why: macOS draws the icon body at 824/1024 with a continuous corner; list views use the
    # smallest slots directly, so those fill the canvas to stay legible.
    return render(size, margin=0.04 if size <= 32 else 100 / 1024, corner=0.225)


def write_svg() -> None:
    reach, width = ARM_REACH * 100 / (2 * ARM_REACH + STROKE), STROKE * 100 / (2 * ARM_REACH + STROKE)
    segments = ' '.join(
        f'M50 50L{50 + reach * math.cos(math.radians(a)):.2f} {50 - reach * math.sin(math.radians(a)):.2f}'
        for a in ARM_ANGLES
    )
    (RESOURCES / 'logo.svg').write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 104 104" role="img" aria-label="Aster">\n'
        f'  <path fill="none" stroke="#fff" stroke-width="{width:.2f}" stroke-linecap="round" d="{segments}"/>\n'
        '</svg>\n'
    )


def write_icns() -> None:
    if shutil.which('iconutil') is None:
        print('iconutil not found; skipped aster.icns (run on macOS)', file=sys.stderr)
        return
    with tempfile.TemporaryDirectory() as temp:
        iconset = Path(temp) / 'aster.iconset'
        iconset.mkdir()
        for logical in (16, 32, 128, 256, 512):
            mac_icon(logical).save(iconset / f'icon_{logical}x{logical}.png')
            mac_icon(logical * 2).save(iconset / f'icon_{logical}x{logical}@2x.png')
        subprocess.run(
            ['iconutil', '-c', 'icns', str(iconset), '-o', str(BUILD / 'aster.icns')], check=True
        )


def write_web_icons() -> None:
    # Why: iOS masks home-screen icons itself and paints transparency black, so those fill the square.
    render(180, margin=0, corner=0).save(WEB / 'apple-touch-icon.png')
    render(512, margin=0, corner=0).save(WEB / 'icon-maskable-512.png')
    for size in (192, 512):
        render(size, margin=0, corner=0.18).save(WEB / f'icon-{size}.png')


def main() -> None:
    mac_icon(1024).save(BUILD / 'aster.png')
    write_icns()
    sizes = [16, 32, 48, 64, 128, 256]
    windows = render(256, margin=0, corner=0.18)
    windows.save(BUILD / 'aster.ico', sizes=[(s, s) for s in sizes])
    write_svg()
    render_glyph(18, BLACK).save(TRAY / 'aster-menu-barTemplate.png')
    render_glyph(36, BLACK).save(TRAY / 'aster-menu-barTemplate@2x.png')
    write_web_icons()
    print('Aster icons written to resources/build, resources/logo.svg, resources/tray, and the web client')


if __name__ == '__main__':
    main()
