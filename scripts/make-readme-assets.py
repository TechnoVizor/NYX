"""Builds the README images from the site's brand sources. Run once, commit the output:
    uv run --with pillow python scripts/make-readme-assets.py ../NYX-project/frontend/public/brand \
        web/node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf C:/Windows/Fonts/consola.ttf
"""

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

brand = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / ".github" / "assets"
(out / "steps").mkdir(parents=True, exist_ok=True)

# The logo is straight-line polygons only (M/L/Z), so draw it directly at 4x and downsample.
svg = (brand / "nyx-logo.svg").read_text()
vw, vh = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).group(1, 2))
polys = [[tuple(map(float, p.split())) for p in re.findall(r"[ML] ?([\d.]+ [\d.]+)", s)] for s in svg.split("Z")[:-1]]


def logo(width: int, color: str) -> Image.Image:
    k = width * 4 / vw
    img = Image.new("RGBA", (width * 4, round(vh * k)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for poly in polys:
        d.polygon([(x * k, y * k) for x, y in poly], fill=color)
    return img.resize((width, round(vh * width / vw)), Image.LANCZOS)


logo(560, "#ffffff").save(out / "logo-dark.png")
logo(560, "#050506").save(out / "logo-light.png")

# Banner in the site's voice: logo and first-person line on the left, the campaign poster bleeding in from the right.
# Fonts: GEIST and MONO point at local TTFs (Geist ships inside next's @vercel/og; Consolas on Windows).
GEIST = sys.argv[2] if len(sys.argv) > 2 else None
MONO = sys.argv[3] if len(sys.argv) > 3 else None
W, H = 1600, 640
banner = Image.new("RGB", (W, H), "#050506")
poster = Image.open(brand / "login.webp").convert("RGB")
pw = 900
poster = poster.resize((pw, round(poster.height * pw / poster.width)), Image.LANCZOS)
top = round(poster.height * 0.17)  # face and the EXPOSURE / DEFENSE frame
poster = poster.crop((0, top, pw, top + H))
fade = Image.linear_gradient("L").rotate(90).resize((pw, H)).point(lambda v: min(255, round(v * 1.8)))
banner.paste(poster, (W - pw, 0), fade)
glow = Image.new("RGB", (W, H), "#8ea2ff")
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).ellipse((-300, H - 140, 900, H + 420), fill=55)
banner = Image.composite(glow, banner, mask.filter(ImageFilter.GaussianBlur(130)))
mark = logo(470, "#ffffff")
banner.paste(mark, (96, 170), mark)
d = ImageDraw.Draw(banner)
if GEIST:
    big = ImageFont.truetype(GEIST, 44)
    d.text((98, 170 + mark.height + 44), "I map your attack surface.", font=big, fill="#f4f4f5")
if MONO:
    small = ImageFont.truetype(MONO, 15)
    def tracked(x, y, text, fill):
        for ch in text:
            d.text((x, y), ch, font=small, fill=fill)
            x += small.getlength(ch) + 2.6
    tracked(98, 170 + mark.height + 112, "EVIDENCE FIRST  ·  AI SECOND  ·  OPEN SOURCE", "#8a8a90")
    tracked(98, 48, "RELEASE 01", "#c8c8cc")
    tracked(98, H - 64, "ATTACK SURFACE ANALYST", "#c8c8cc")
for x, y in ((60, 60), (60, H - 60)):
    d.line((x - 9, y, x + 9, y), fill="#8a8a90", width=1)
    d.line((x, y - 9, x, y + 9), fill="#8a8a90", width=1)
banner.save(out / "banner.png", optimize=True)

Image.open(brand / "crew" / "flex.webp").save(out / "nyx.png", optimize=True)

for f in sorted((brand / "steps").glob("*.webp")):
    im = Image.open(f).convert("RGB")
    im.thumbnail((420, 560), Image.LANCZOS)
    im.save(out / "steps" / f"{f.stem}.jpg", quality=82, optimize=True)

print("wrote", *sorted(p.relative_to(out).as_posix() for p in out.rglob("*.*")))
