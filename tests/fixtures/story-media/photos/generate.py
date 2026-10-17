"""Regenerates the raster gallery fixtures with known pixel dimensions.

Each photograph is a smooth, distinctive composition so it compresses to a few
tens of kilobytes while still being a real JPEG. The names follow WordPress's
`name-WxH.jpg` convention; the un-suffixed file is the full/original.

    python3 tests/fixtures/story-media/photos/generate.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent
ORIGINAL = (2400, 1600)
DERIVATIVES = [(300, 200), (768, 512), (1024, 683), (1536, 1024)]
PHOTOS = {
    "field-a": ((24, 74, 112), (233, 164, 59)),
    "field-b": ((92, 38, 99), (88, 196, 154)),
    "field-c": ((120, 32, 36), (232, 226, 205)),
    "field-d": ((20, 90, 60), (240, 200, 90)),
    "field-e": ((60, 60, 120), (250, 140, 120)),
}


def compose(top, bottom):
    width, height = ORIGINAL
    image = Image.new("RGB", ORIGINAL)
    pixels = ImageDraw.Draw(image)
    for y in range(height):
        mix = y / (height - 1)
        pixels.line([(0, y), (width, y)], fill=tuple(round(a + (b - a) * mix) for a, b in zip(top, bottom)))
    draw = ImageDraw.Draw(image)
    draw.ellipse([width * 0.58, height * 0.12, width * 0.88, height * 0.12 + width * 0.30], fill=bottom)
    draw.polygon([(0, height), (width * 0.35, height * 0.55), (width * 0.7, height)], fill=top)
    draw.rectangle([width * 0.1, height * 0.8, width * 0.9, height * 0.82], fill=bottom)
    return image


for name, (top, bottom) in PHOTOS.items():
    image = compose(top, bottom)
    image.save(OUT / f"{name}.jpg", "JPEG", quality=55, optimize=True, subsampling=2)
    for size in DERIVATIVES:
        image.resize(size, Image.LANCZOS).save(OUT / f"{name}-{size[0]}x{size[1]}.jpg", "JPEG", quality=55, optimize=True, subsampling=2)
