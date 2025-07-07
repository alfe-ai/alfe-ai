#!/usr/bin/env python3
# remove_bg.py - make artwork transparencies for DTG/DTF printing
import sys
import pathlib
import subprocess

try:
    from PIL import Image
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

try:
    from rembg import remove
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rembg"])
    from rembg import remove

try:
    from tqdm import tqdm
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tqdm"])
    from tqdm import tqdm


def process_image(src: pathlib.Path, dst: pathlib.Path):
    """Remove background and save 32-bit PNG."""
    with Image.open(src) as im:
        out = remove(im)
        out.save(dst, "PNG")


def main():
    if len(sys.argv) != 3:
        print("Usage: remove_bg.py <input_file|input_folder> <output_file|output_folder>")
        sys.exit(1)

    in_path = pathlib.Path(sys.argv[1])
    out_path = pathlib.Path(sys.argv[2])

    if in_path.is_file():
        out_path.parent.mkdir(parents=True, exist_ok=True)
        process_image(in_path, out_path)
    else:
        out_path.mkdir(parents=True, exist_ok=True)
        for src in tqdm(sorted(in_path.glob('*'))):
            if src.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
                continue
            dst = out_path / (src.stem + '.png')
            process_image(src, dst)


if __name__ == '__main__':
    main()
