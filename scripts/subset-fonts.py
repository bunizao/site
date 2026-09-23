#!/usr/bin/env python3
"""Split the mono webfonts into a Latin cut and the rest.

Both mono families are pulled in by a handful of characters on most pages --
the channel name on /mood and /mood/[id], the Cmd-K badge and theme label in
the header -- and each was costing a full ~70KB file. Splitting them on
`unicode-range` lets a page fetch only the half it renders: a page with nothing
but Latin never sees the box-drawing, arrows and symbols that code samples and
docs diagrams need.

The two cuts are disjoint and together cover exactly what the source file did,
so a page that does render both halves downloads the same glyphs it always
did, only in two requests. Layout features are kept explicitly rather than by
pyftsubset's default list, which drops `zero`, `ss01`, `sups` and the `cv*`
alternates the stylesheets ask for by name.

Run after replacing a source font:

    python3 scripts/subset-fonts.py

Needs fontTools with brotli (`pip install 'fonttools[woff]'`). Writes
`<family>-latin.woff2` and `<family>-rest.woff2` next to the source.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / 'public' / 'fonts'

# Where each family gets cut. The two are not the same because the two faces do
# different jobs.
#
# Geist Mono is the UI mono -- the header's Cmd-K badge, the theme label, a back
# link's arrow -- so its near half carries Latin, general punctuation, the arrow
# block and the misc-technical block that holds the Command/Option/Shift glyphs.
#
# JetBrains Mono is the code voice. Its arrows are what `calt` substitutes `->`
# into, and those glyphs come along with the Latin cut through feature closure
# rather than through the cmap, so the arrow block itself belongs with the box
# drawing on the far side: only a docs diagram types one literally.
#
# Keep in sync with the two `unicode-range` declarations per family in
# src/styles/globals.css. They must stay disjoint, and they must not reach into
# planes the fonts do not cover -- a range the file does not actually serve
# still triggers the download, and one emoji in a mono element was pulling a
# whole file down to look for a glyph that was never in it.
NEAR_CUT = {
    'geist-mono': [(0x0000, 0x024F), (0x2000, 0x206F), (0x2190, 0x21FF), (0x2300, 0x23FF)],
    'jetbrains-mono': [(0x0000, 0x024F), (0x2000, 0x206F)],
}

# Everything the stylesheets name plus everything a shaper applies on its own.
# `aalt`, `ss02`+ and the unused `cv*` alternates are the ones worth dropping:
# they carry alternate glyphs nothing on the site selects.
FEATURES = (
    'ccmp,locl,mark,mkmk,calt,rclt,rlig,rvrn,clig,liga,kern,'
    'case,zero,tnum,pnum,ss01,cv11,sups,subs,sinf,ordn,frac,numr,dnom'
)

SOURCES = ['jetbrains-mono-variable.woff2', 'geist-mono-variable.woff2']


def in_near(cp: int, stem: str) -> bool:
    return any(lo <= cp <= hi for lo, hi in NEAR_CUT[stem])


def subset(src: Path, out: Path, unicodes: str) -> int:
    subprocess.run(
        [
            sys.executable, '-m', 'fontTools.subset', str(src),
            f'--unicodes={unicodes}',
            f'--layout-features={FEATURES}',
            '--flavor=woff2',
            f'--output-file={out}',
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return out.stat().st_size


def main() -> None:
    for name in SOURCES:
        src = FONT_DIR / name
        stem = name.replace('-variable.woff2', '')
        covered = sorted(TTFont(src).getBestCmap())

        latin = [cp for cp in covered if in_near(cp, stem)]
        rest = [cp for cp in covered if not in_near(cp, stem)]

        latin_size = subset(src, FONT_DIR / f'{stem}-latin.woff2', ','.join(f'U+{cp:04X}' for cp in latin))
        rest_size = subset(src, FONT_DIR / f'{stem}-rest.woff2', ','.join(f'U+{cp:04X}' for cp in rest))

        print(
            f'{stem}: {src.stat().st_size} -> latin {latin_size} + rest {rest_size} '
            f'({len(latin)} + {len(rest)} codepoints)'
        )


if __name__ == '__main__':
    main()
