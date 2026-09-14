"""Build the README cover and a silent, captioned portfolio walkthrough."""

from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont, ImageOps
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
SCENES = DEMO / "scenes"
SIZE = (1280, 720)
BG = "#07100b"
PANEL = "#101c16"
TEXT = "#f2f5f3"
MUTED = "#a4afa8"
ACCENT = "#32d583"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def fit_image(path: Path, box: tuple[int, int, int, int]) -> Image.Image:
    image = Image.open(path).convert("RGB")
    width, height = box[2] - box[0], box[3] - box[1]
    image.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), PANEL)
    canvas.paste(image, ((width - image.width) // 2, (height - image.height) // 2))
    return ImageOps.expand(canvas, border=1, fill="#26372e")


def scene(number: int, title: str, subtitle: str, screenshot: str | None = None):
    image = Image.new("RGB", SIZE, BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((36, 28, 1244, 692), radius=28, fill="#0b1510")
    draw.text((74, 58), "POKER LEDGER", font=font(17, True), fill=ACCENT)
    draw.text((74, 91), title, font=font(38, True), fill=TEXT)
    draw.text((76, 144), subtitle, font=font(22), fill=MUTED)
    if screenshot:
        shot = fit_image(DEMO / screenshot, (74, 196, 1206, 650))
        image.paste(shot, (74, 196))
    else:
        draw.text((74, 270), "Next.js 16  •  React 19  •  TypeScript  •  PostgreSQL  •  Supabase", font=font(25), fill=TEXT)
        draw.text((74, 336), "Join a table  →  Play in realtime  →  Settle every balance", font=font(29, True), fill=ACCENT)
    draw.text((1160, 658), f"{number}/8", font=font(15), fill=MUTED)
    return image


def main():
    SCENES.mkdir(parents=True, exist_ok=True)
    definitions = [
        ("Poker Ledger", "A full-stack home poker companion", None, 6),
        ("A useful dashboard", "Games, players and outstanding payments at a glance", "captures/01-dashboard.png", 7),
        ("Join from any phone", "A shareable QR code opens an authenticated guest lobby", "captures/02-lobby.png", 7),
        ("Realtime admission", "The host sees Jordan arrive and controls access to the table", "captures/05-host-approval.png", 7),
        ("No refresh needed", "The guest moves from pending to approved through Supabase Realtime", "captures/06-guest-approved.png", 6),
        ("Server-owned game state", "PostgreSQL enforces turns, blinds, actions, all-ins and side pots", "live-table.png", 9),
        ("Private digital cards", "Players receive only their own cards; contested hands reveal at showdown", "live-table.png", 8),
        ("Close the loop", "Completed games flow into lifetime standings and a compact settlement plan", "ledger.png", 9),
    ]
    concat = []
    for index, (title, subtitle, screenshot, duration) in enumerate(definitions, 1):
        path = SCENES / f"{index:02}.png"
        scene(index, title, subtitle, screenshot).save(path, optimize=True)
        concat.extend([f"file '{path.as_posix()}'", f"duration {duration}"])
    concat.append(f"file '{(SCENES / '08.png').as_posix()}'")
    concat_path = SCENES / "concat.txt"
    concat_path.write_text("\n".join(concat) + "\n")

    cover = Image.open(SCENES / "06.png").convert("RGB")
    cover.save(DEMO / "cover.png", optimize=True)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([
        ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path),
        "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
        "-crf", "22", "-movflags", "+faststart", str(DEMO / "poker-ledger-demo.mp4"),
    ], check=True)
    print(DEMO / "poker-ledger-demo.mp4")


if __name__ == "__main__":
    main()
