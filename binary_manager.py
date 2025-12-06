import os
import shutil
import subprocess
import logging
import urllib.request

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

logger = logging.getLogger("app")

YTARCHIVE_PATH = None
YTDLP_PATH = None


def get_ytarchive():
    """Downloads and extracts the ytarchive binary."""
    logger.info("ytarchive not found. Downloading...")
    url = "https://github.com/Kethsar/ytarchive/releases/latest/download/ytarchive_linux_amd64.zip"
    try:
        with urllib.request.urlopen(url) as resp:
            with ZipFile(BytesIO(resp.read())) as zfile:
                zfile.extractall("./")
        subprocess.call("chmod +x ./ytarchive", shell=True)
        logger.info("Finished setting up ytarchive")
        return Path("./ytarchive").resolve() 
    except Exception:
        logger.error("Failed to download or set up ytarchive.", exc_info=True)
        return Path("./ytarchive").resolve()


def get_ytdlp():
    """Downloads and sets up the yt-dlp binary."""
    logger.info("Starting to download yt-dlp")
    try:
        url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
        urllib.request.urlretrieve(url, "./yt-dlp")
        subprocess.call("chmod +x ./yt-dlp", shell=True)
        logger.info("Finished setting up yt-dlp")
        return Path("./yt-dlp").resolve() 
        
    except Exception:
        logger.error("Failed to download or set up yt-dlp.", exc_info=True)
        return Path("./yt-dlp").resolve


def initialize_binaries():
    """Determines and sets the paths for ytarchive and yt-dlp."""
    global YTARCHIVE_PATH, YTDLP_PATH
    
    if "YTARCHIVE_BIN" in os.environ:
        path = Path(os.environ["YTARCHIVE_BIN"])
        logger.info("Using YTARCHIVE_BIN env variable")
        if path.is_file():
            logger.info("Using ytarchive binaries from ENV")
            YTARCHIVE_PATH = path.resolve()
        else:
            YTARCHIVE_PATH = get_ytarchive()
    else:
        path = Path("./ytarchive")
        logger.warning("No YTARCHIVE_BIN env variable set. Checking local")
        if path.is_file():
            logger.info("Using local ytarchive binaries")
            YTARCHIVE_PATH = path.resolve()
        else:
            YTARCHIVE_PATH = get_ytarchive()

    if "YTDLP_BIN" in os.environ:
        path = Path(os.environ["YTDLP_BIN"])
        logger.info("Using YTDLP_BIN env variable")
        if path.is_file():
            logger.info("Using yt-dlp binaries from ENV")
            YTDLP_PATH = path
        else:
            YTDLP_PATH = get_ytdlp()
    else:
        path = Path("./yt-dlp")
        logger.warning("No YTDLP_BIN env variable set. Checking local")
        if path.is_file():
            logger.info("Using local yt-dlp binaries")
            YTDLP_PATH = path.resolve() 
        else:
            YTDLP_PATH = get_ytdlp()

initialize_binaries()
