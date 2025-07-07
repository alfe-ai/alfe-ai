#!/usr/bin/env python3
"""
remove_bg.py – create transparent 32-bit PNGs for DTG/DTF printing.

Fixes:
1. Uses the more general-purpose `isnet-general-use` model (better on artwork).
2. Forces RGBA so “missing” alpha never appears as black.
3. Enables alpha-matting and gently enlarges the kept region to avoid hard cuts.
"""

import sys
import pathlib
from PIL import Image
from rembg import remove, new_session
from tqdm import tqdm

# One global session keeps the model in memory between images.
SESSION = new_session(model_name="isnet-general-use")


def process_image(src: pathlib.Path, dst: pathlib.Path) -> None:
    """Remove background from *src* and save result to *dst*."""
    with Image.open(src) as im:
        im = im.convert("RGBA")  # ensure alpha channel exists

        out = remove(
            im,
            session=SESSION,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )

        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst, "PNG")


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: remove_bg.py <input_file|input_folder> <output_file|output_folder>")
        sys.exit(1)

    in_path = pathlib.Path(sys.argv[1])
    out_path = pathlib.Path(sys.argv[2])

    if in_path.is_file():
        process_image(in_path, out_path)
    else:
        out_path.mkdir(parents=True, exist_ok=True)
        for src in tqdm(sorted(in_path.glob("*"))):
            if src.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            dst = out_path / f"{src.stem}.png"
            process_image(src, dst)


if __name__ == "__main__":
    main()
