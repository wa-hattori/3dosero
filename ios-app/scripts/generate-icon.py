"""アプリアイコン(1024x1024、アルファチャンネルなし)を生成するスクリプト。

「立体オセロ」のコンセプト(積み重なった正方形の盤面)を表す、3層のフラットな
アイソメトリック板+石2個のデザイン。ImageMagick(`convert`、librsvgベースの
SVGラスタライズ)が必要。

使い方:
    python3 ios-app/scripts/generate-icon.py

出力:
    ios-app/icon-source.svg                                            (デザインのソース)
    ios-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png (Xcodeが読む1024x1024マスター)

Xcode 14以降のアセットカタログは1024x1024の1枚だけで全サイズを自動生成するため、
複数サイズを個別に用意する必要はない。
"""

import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
IOS_APP_DIR = SCRIPT_DIR.parent
SVG_OUT = IOS_APP_DIR / "icon-source.svg"
APPICONSET = IOS_APP_DIR / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

CX = 512
BG = "#111318"
STONE_BLACK = "#111318"
STONE_WHITE = "#f4f4f4"

W0, H0 = 360, 180
THICK = 32
GAP = 132
CY_TOP = 380


def diamond_pts(cx: float, cy: float, w: float, h: float) -> str:
    return f"{cx},{cy - h} {cx + w},{cy} {cx},{cy + h} {cx - w},{cy}"


def grid_lines(cx: float, cy: float, w: float, h: float, color: str, n: int = 4, stroke: int = 6) -> str:
    top = (cx, cy - h)
    lines = []
    for i in range(1, n):
        t = i / n
        x1, y1 = top[0] + t * (-w), top[1] + t * h
        x2, y2 = x1 + w, y1 + h
        lines.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{color}" stroke-width="{stroke}" stroke-linecap="round"/>'
        )
        x3, y3 = top[0] + t * w, top[1] + t * h
        x4, y4 = x3 - w, y3 + h
        lines.append(
            f'<line x1="{x3:.1f}" y1="{y3:.1f}" x2="{x4:.1f}" y2="{y4:.1f}" '
            f'stroke="{color}" stroke-width="{stroke}" stroke-linecap="round"/>'
        )
    return "\n".join(lines)


def plate(
    cx: float, cy: float, w: float, h: float, fill: str, edge: str,
    grid_color: str | None = None, thickness: float = THICK,
) -> str:
    parts = []
    bottom = (cx, cy + h)
    right = (cx + w, cy)
    left = (cx - w, cy)
    parts.append(
        f'<polygon points="{right[0]},{right[1]} {bottom[0]},{bottom[1]} '
        f'{bottom[0]},{bottom[1] + thickness} {right[0]},{right[1] + thickness}" fill="{edge}"/>'
    )
    parts.append(
        f'<polygon points="{left[0]},{left[1]} {bottom[0]},{bottom[1]} '
        f'{bottom[0]},{bottom[1] + thickness} {left[0]},{left[1] + thickness}" fill="{edge}"/>'
    )
    parts.append(f'<polygon points="{diamond_pts(cx, cy, w, h)}" fill="{fill}"/>')
    if grid_color:
        parts.append(grid_lines(cx, cy, w, h, grid_color))
    return "\n".join(parts)


def stone(cx: float, cy: float, r: float, fill: str, stroke: str) -> str:
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="8"/>'


def build_svg() -> str:
    layers = [
        (CY_TOP + 2 * GAP, 0.86, "#123a26", "#0b2417", None),
        (CY_TOP + GAP, 0.93, "#175e39", "#0e3a24", None),
        (CY_TOP, 1.0, "#2f8f57", "#1c6a3f", "#0d3a20"),
    ]
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
        f'<rect width="1024" height="1024" fill="{BG}"/>',
    ]
    for cy, scale, fill, edge, grid_color in layers:
        parts.append(plate(CX, cy, W0 * scale, H0 * scale, fill, edge, grid_color))
    parts.append(stone(CX - 115, CY_TOP - 10, 58, STONE_BLACK, "#4a4a4a"))
    parts.append(stone(CX + 80, CY_TOP + 55, 58, STONE_WHITE, "#c9c9c9"))
    parts.append("</svg>")
    return "\n".join(parts)


def main() -> None:
    svg = build_svg()
    SVG_OUT.write_text(svg)
    print(f"wrote {SVG_OUT}")

    APPICONSET.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["convert", str(SVG_OUT), "-resize", "1024x1024", "/tmp/_icon_raw.png"], check=True)
    # App Store提出用アイコンはアルファチャンネルを持てないため、不透明化する。
    subprocess.run(
        ["convert", "/tmp/_icon_raw.png", "-background", BG, "-alpha", "remove", "-alpha", "off", str(APPICONSET)],
        check=True,
    )
    print(f"wrote {APPICONSET}")


if __name__ == "__main__":
    main()
