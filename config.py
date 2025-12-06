import os

if "COOKIE_FILE" in os.environ:
    COOKIE_FILE_PATH = os.environ["COOKIE_FILE"]
else:
    COOKIE_FILE_PATH = "./cookie.txt"

YTDLP_MAP = {
    "retry_stream": ["--wait-for-video", False, False],
    "threads": ["--concurrent-fragments", False, False],
    "wait_for_live": ["--live-from-start", True, False],
    "embed_thumbnail": ["--embed-thumbnail", True, False],
    "use_cookies": [f" --cookies '{COOKIE_FILE_PATH}'", True, False],
    "force_mkv": ["--mkv", True, False],
    "output_filename": ["--output", False, False],
}

YTARCHIVE_MAP = {
    "retry_stream": ["--retry-stream", False, False],
    "threads": ["--threads", False, False],
    "wait_for_live": ["--wait", True, False],
    "embed_thumbnail": ["--thumbnail", True, False],
    "force_mkv": ["--mkv", True, False],
    "use_cookies": [f" --cookies '{COOKIE_FILE_PATH}'", True, False],
    "output_filename": ["--output", False, True],
}
