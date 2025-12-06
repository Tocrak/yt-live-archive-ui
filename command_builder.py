import os
import logging
from binary_manager import YTARCHIVE_PATH, YTDLP_PATH

logger = logging.getLogger("app")

def build_ytarchive_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for ytarchive."""
    cmd = str(YTARCHIVE_PATH)

    for k, v in params.items():
        if isinstance(v, bool):
            cmd += f" {k}"
        elif k == "--output":
            cmd += f" {k} '/downloads/{v}'"
        else:
            cmd += f" {k} '{v}'"

    cmd += f" {url} {quality}"
    return cmd


def build_ytdlp_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for yt-dlp."""
    cmd = str(YTDLP_PATH)

    for k, v in params.items():
        if k == "--mkv" and quality != "audio_only":
            cmd += " --remux-video mkv --merge-output-format mkv"
        elif k == "--retry-stream":
            cmd += f" --wait-for-video {v}"
        elif k == "--thumbnail":
            cmd += " --embed-thumbnail"
        elif k == "--threads":
            cmd += f" --concurrent-fragments {v}"
        elif k == "--wait":
            cmd += " --live-from-start"
        elif k == "--output":
            cmd += f" {k} '{v}'"
        elif isinstance(v, bool):
            cmd += f" {k}"
        else:
            cmd += f" {k} '{v}'"

    cmd += " --paths '/downloads'"

    if quality == "audio_only":
        cmd += " -x --extract-audio"
    elif quality != "best":
        height = quality[:-1]
        cmd += f" -f bestvideo[height={height}]"

    cmd += " --progress --newline --no-colors --js-runtimes quickjs"
    cmd += f" {url}"

    return cmd
