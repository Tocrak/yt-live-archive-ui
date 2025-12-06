import os
import logging
from binary_manager import YTARCHIVE_PATH, YTDLP_PATH

logger = logging.getLogger("app")

if "COOKIE_FILE" in os.environ:
    COOKIE_FILE_PATH = os.environ["COOKIE_FILE"]
else:
    COOKIE_FILE_PATH = "./cookie.txt"

def build_ytarchive_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for ytarchive."""
    cmd = str(YTARCHIVE_PATH)

    if params.get("--cookies"):
        cmd += f" --cookies '{COOKIE_FILE_PATH}'"
        del params["--cookies"]

    output = params.get("--output")
    if output:
        cmd += f" --output '/downloads/{output}'"
        del params["--output"]

    for k, v in params.items():
        if isinstance(v, bool):
            cmd += f" {k}"
        else:
            cmd += f" {k} '{v}'"

    cmd += f" {url} {quality}"
    return cmd


def build_ytdlp_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for yt-dlp."""
    cmd = str(YTDLP_PATH)

    if params.get("--cookies"):
        cmd += f" --cookies '{COOKIE_FILE_PATH}'"
        del params["--cookies"] 

    retry = params.get("--retry-stream")
    if retry:
        cmd += f" --wait-for-video {retry}"
        del params["--retry-stream"]

    threads = params.get("--threads")
    if threads:
        cmd += f" --concurrent-fragments {threads}"
        del params["--threads"]
    
    if params.get("--wait"):
        cmd += " --live-from-start"
        del params["--wait"]

    if params.get("--thumbnail"):
        cmd += " --embed-thumbnail"
        del params["--thumbnail"]

    if params.get("--mkv"):
        if quality != "audio_only":
            cmd += " --remux-video mkv --merge-output-format mkv"
        del params["--mkv"]
        
    output = params.get("--output")
    if output:
        cmd += f" --output '{output}'"
        del params["--output"]

    for k, v in params.items():
        if isinstance(v, bool):
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
