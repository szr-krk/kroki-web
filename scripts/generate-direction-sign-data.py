"""Extract B-5a vectors from 137/138/139.pdf and bundled sign font metrics.

Usage: python scripts/generate-direction-sign-data.py path/to/137.pdf path/to/138.pdf path/to/139.pdf
Development dependencies: pdfplumber, fonttools. No runtime dependencies.
"""
import hashlib
import json
import pathlib
import sys

import pdfplumber
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

root = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 4:
    raise SystemExit("Usage: generate-direction-sign-data.py <137.pdf> <138.pdf> <139.pdf>")
sources = [pathlib.Path(arg) for arg in sys.argv[1:]]
font_path = root / "src/arial-narrow.ttf"
font = TTFont(font_path)
glyph_set = font.getGlyphSet()

def bounds(name):
    pen = BoundsPen(glyph_set)
    glyph_set[name].draw(pen)
    return pen.bounds or (0, 0, 0, 0)

glyphs = {}
for code, name in font.getBestCmap().items():
    box = bounds(name)
    glyphs[code] = [font["hmtx"][name][0], box[0], box[2]]

# The first arrow-to-text gap is labelled 4a in the source drawing.
pdf_a = (269.520 - 251.352) / 4
scale = 100 / pdf_a
def extract_arrows(source, regions):
    arrows = {}
    with pdfplumber.open(source) as pdf:
        page = pdf.pages[0]
        for direction, (left, top, right, bottom) in regions.items():
            shapes = [s for s in page.curves + page.lines
                      if s["stroke"] and left <= s["x0"] <= s["x1"] <= right
                      and top <= s["top"] <= s["bottom"] <= bottom]
            x0 = min(s["x0"] for s in shapes)
            y0 = min(s["top"] for s in shapes)
            x1 = max(s["x1"] for s in shapes)
            y1 = max(s["bottom"] for s in shapes)
            parts = []
            for shape in shapes:
                for command in shape["path"]:
                    op, *points = command
                    parts.append(op.upper() + " ".join(
                        f"{(x-x0)*scale:.3f} {(y-y0)*scale:.3f}" for x, y in points))
            arrows[direction] = {"width": round((x1-x0)*scale, 3),
                                 "height": round((y1-y0)*scale, 3), "path": " ".join(parts)}
    return arrows

arrows = extract_arrows(sources[0], {
    "left": (201, 217, 253, 263), "up": (204, 446, 249, 498),
    "up-right": (349, 681, 392, 724)})
double_arrows = extract_arrows(sources[1], {
    "up": (205, 190, 249, 263), "right": (345, 428, 397, 501),
    "up-right": (341, 672, 400, 731)})

def city_text(source):
    # The PDF repeats hundreds of fill triangles inside the letters. Join only
    # the original outline segments, retaining the source typeface as small paths.
    with pdfplumber.open(source) as pdf:
        segments = []
        for shape in pdf.pages[0].curves + pdf.pages[0].lines:
            if not (177 <= shape["x0"] <= shape["x1"] <= 325 and
                    626 <= shape["top"] <= shape["bottom"] <= 698 and
                    shape["stroke"] and not shape["fill"]):
                continue
            commands = shape["path"]
            if commands[-1][0] == "h":
                continue
            start = commands[0][1]
            for command in commands[1:]:
                end = command[-1]
                if sum((start[i] - end[i]) ** 2 for i in (0, 1)) > 0.01:
                    segment = (start, command)
                    if segment not in segments:
                        segments.append(segment)
                start = end
    # Remove shorter duplicate cedilla edges and a tiny overlapping connector.
    def contained(segment, other):
        a, cmd = segment; b = cmd[-1]
        c, alt = other; d = alt[-1]
        if cmd[0] != "l" or alt[0] != "l":
            return False
        if abs(a[0] - b[0]) < 0.001 and abs(c[0] - d[0]) < 0.001 and abs(a[0] - c[0]) < 0.001:
            return min(c[1], d[1]) <= min(a[1], b[1]) and max(a[1], b[1]) <= max(c[1], d[1])
        return False
    segments = [s for s in segments if not any(s != t and contained(s, t) for t in segments)
                and not (s[1][0] == "l" and sum((s[0][i] - s[1][-1][i]) ** 2 for i in (0, 1)) < 0.06)]
    paths = []
    distance = lambda a, b: sum((a[i] - b[i]) ** 2 for i in (0, 1))
    while segments:
        start, command = segments.pop(0)
        commands = [("m", start), command]
        end = command[-1]
        while distance(end, start) > 0.02:
            candidates = [(distance(end, s[0]), i, False) for i, s in enumerate(segments)]
            candidates += [(distance(end, s[1][-1]), i, True) for i, s in enumerate(segments)]
            if not candidates or min(candidates)[0] > 0.02:
                raise ValueError(f"Unclosed city glyph near {end}")
            _, index, reverse = min(candidates)
            origin, cmd = segments.pop(index)
            if reverse:
                cmd = (cmd[0], *reversed(cmd[1:-1]), origin)
            commands.append(cmd)
            end = cmd[-1]
        commands.append(("z",))
        paths.extend(commands)
    unit = 1980 / (441.547 - 160.117)
    def point(p):
        return f"{(p[0]-160.117)*unit:.2f} {(p[1]-610.192)*unit:.2f}"
    return " ".join(cmd[0].upper() + " ".join(point(p) for p in cmd[1:]) for cmd in paths)

data = {"sources": [{"file": source.name, "page": 1, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()} for source in sources],
        "fontSha256": hashlib.sha256(font_path.read_bytes()).hexdigest(),
        "unit": 100, "capHeight": round(28.386278037 * scale, 3),
        "outline": round(0.722085 * scale, 3), "fontCapHeight": bounds("H")[3],
        "fontUnitsPerEm": font["head"].unitsPerEm,
        "fallbackGlyph": [font["hmtx"][".notdef"][0], *bounds(".notdef")[::2]],
        "glyphs": glyphs, "arrows": arrows, "doubleArrows": double_arrows,
        "cityTextPath": city_text(sources[2])}
output = root / "src/data/traffic-sign-direction-data.generated.js"
output.write_text("// Generated by scripts/generate-direction-sign-data.py; do not edit by hand.\n"
                  + "window.KrokiDirectionSignData = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(output)
