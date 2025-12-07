import os
import logging
from services.binary_manager import YTARCHIVE_PATH, YTDLP_PATH
from config.config import COOKIE_FILE_PATH, YTDLP_MAP, YTARCHIVE_MAP

logger = logging.getLogger("app")

def get_ytdlp_mkv_command(value: bool, quality: str) -> str:
    if value and quality != "audio_only":
        return " --remux-video mkv --merge-output-format mkv"
    return ""

def build_cmd_from_map(url: str, quality: str, params: dict, mapping: dict, binary_path: str, is_ytdlp: bool) -> str:
    """Generic function to build commands using a mapping table, finalized."""
    cmd = str(binary_path)
    for canonical_key in list(params.keys()):
        
        if canonical_key in mapping:
            value = params.pop(canonical_key) 
            flag, is_boolean, prepend_path = mapping[canonical_key]

            if is_ytdlp and canonical_key == "force_mkv":
                cmd += get_ytdlp_mkv_command(value, quality)
                continue

            if is_boolean:
                if value:
                    if flag.startswith(" "):
                        cmd += flag
                    else:
                        cmd += f" {flag}"
            else:
                if canonical_key == "output_filename":
                    path_prefix = "/downloads/" if prepend_path else ""
                    cmd += f" {flag} '{path_prefix}{value}'"
                else:
                    cmd += f" {flag} {value}"
    
    for k, v in params.items():
        if k == "customParams":
            continue
        
        logger.warning(f"Unmapped parameter passed: {k}={v}. Attempting generic addition.")
        
        if isinstance(v, bool) and v:
            cmd += f" {k}"
        elif not isinstance(v, bool):
            cmd += f" {k} '{v}'"

    if is_ytdlp:
        cmd += " --paths '/downloads'"
        if quality == "audio_only":
            cmd += " -x --extract-audio"
        elif quality != "best":
            height = quality[:-1]
            cmd += f" -f bestvideo[height={height}]"

        cmd += " --progress --newline --no-colors --js-runtimes quickjs"
        cmd += f" {url}"
    else:
        cmd += f" {url} {quality}"
        
    return cmd

def build_ytarchive_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for ytarchive by delegating to the generic builder."""
    return build_cmd_from_map(url, quality, params, YTARCHIVE_MAP, YTARCHIVE_PATH, False)


def build_ytdlp_cmd(url: str, quality: str, params: dict) -> str:
    """Builds the shell command for yt-dlp by delegating to the generic builder."""
    return build_cmd_from_map(url, quality, params, YTDLP_MAP, YTDLP_PATH, True)
