import re
import asyncio
import logging
import traceback

from typing import Dict, Any, Awaitable, Callable
from dependencies import tasks

logger = logging.getLogger("app")

try:
    from callbacks import callbacks
except ImportError:
    callbacks = None


def get_id(base: str) -> str:
    """Generates a unique ID based on a base string (e.g., youtubeID)."""
    if base not in tasks:
        return base
    i = 0
    while True:
        candidate = f"{base}.{i}"
        if candidate not in tasks:
            return candidate
        i += 1

def extract_final_file_path(out_text: str, binary: str) -> str | None:
    destination_match = re.search(
        r'\[download\] Destination:\s*["\']?(?P<path>.+?)["\']?$', 
        out_text, 
        re.MULTILINE
    )

    if binary == "ytarchive" and "Final file:" in out_text:
        return out_text.split("Final file:")[-1].strip()
    elif binary in ("ytdlp", "yt-dlp") and destination_match:
        return destination_match.group('path').strip()
    return None

async def run_download(uid: str):
    """
    Main function to execute the download command, stream output,
    update task state, and execute callbacks.
    """
    data: Dict[str, Any] = tasks[uid]
    cmd = data["cmd"]

    logger.info(f"[{uid}] Starting task")
    logger.info(f"[{uid}] Executing command:\n{cmd}")
    progress_re = re.compile(r"(?:^\d+:\s+)?\[download\].+(?: at |ETA|\%)")
    err_lines = []

    async def handle_stream(stream: asyncio.StreamReader, callback: Callable[[str], Awaitable[None]]):
        """Reads chunks from a stream and calls a handler for each line."""
        while True:
            chunk = await stream.readline()
            if not chunk:
                break
            
            try:
                decoded = chunk.decode("utf-8", errors="replace")
            except:
                decoded = str(chunk)
                
            line = decoded.replace('\r', '').strip()
            if line:
                await callback(line)

    async def handle_stdout(line: str):
        """Processes standard output for progress tracking and logging."""
        if not data.get("started_log", False):
            data["started_log"] = True

        logger.debug(f"[{uid}] STDOUT: {line}")
        prev = data["progress_log"].splitlines() if data["progress_log"] else []
        is_progress = progress_re.search(line)
        
        if is_progress:
            data["active"] = True
            if prev and progress_re.search(prev[-1]):
                prev[-1] = line
            else:
                prev.append(line)
        else:
            prev.append(line)

        data["progress_log"] = "\n".join(prev)

    async def handle_stderr(line: str):
        """Processes standard error for errors and logging."""
        if not data.get("started_log", False):
            data["started_log"] = True

        logger.debug(f"[{uid}] STDERR: {line}")
        prev = data["progress_log"].splitlines() if data["progress_log"] else []
        is_progress = progress_re.search(line)

        if is_progress:
            data["active"] = True
            if prev and progress_re.search(prev[-1]):
                prev[-1] = line
            else:
                prev.append(line)
        else:
            prev.append(line)
            
        data["progress_log"] = "\n".join(prev)
        err_lines.append(line + "\n")


    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    data["process"] = proc

    t_out = asyncio.create_task(handle_stream(proc.stdout, handle_stdout))
    t_err = asyncio.create_task(handle_stream(proc.stderr, handle_stderr))

    logger.info(f"[{uid}] Waiting for process to finish...")
    await asyncio.gather(t_out, t_err)

    rc = await proc.wait()
    logger.info(f"[{uid}] Process exited with return code: {rc}")

    data["completed"] = True
    data["output"] = {
        "out": data["progress_log"],
        "err": "".join(err_lines)
    }

    if callbacks and data.get("callbacks"):
        logger.info(f"[{uid}] Executing callbacks: {data['callbacks']}")
        final_file = extract_final_file_path(data["output"]["out"], data["binary"])
        logger.info(f"[{uid}] Final file path detected: {final_file}")

        if final_file:
            for cb_id in data["callbacks"]:
                try:
                    logger.info(f"[{uid}] Running callback {cb_id}")
                    result = callbacks[cb_id](final_file)

                    if "front" in result and result["front"]:
                        for key, block in result["front"].items():
                            data["output"]["out"] = f"{key}:\n{block['out']}\n\n{data['output']['out']}"
                            if block["err"]:
                                data["output"]["err"] = f"{key}:\n{block['err']}\n\n{data['output']['err']}"
                    
                    if "end" in result and result["end"]:
                        for key, block in result["end"].items():
                            data["output"]["out"] += f"\n\n{key}:\n{block['out']}"
                            if block["err"]:
                                data["output"]["err"] += f"\n\n{key}:\n{block['err']}"

                except Exception:
                    logger.exception(f"[{uid}] Callback {cb_id} failed")
                    data["output"]["err"] += f"\n\n[Callback {cb_id} ERROR]\n{traceback.format_exc()}"
    
    logger.info(f"[{uid}] Task finished")
