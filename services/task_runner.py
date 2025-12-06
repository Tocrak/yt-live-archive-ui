import re
import asyncio
import logging
import traceback

from typing import Dict, Any, Awaitable, Callable, List
from config.dependencies import tasks
from config.schemas import TaskStatus 

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
    """Extracts the final downloaded file path from the output logs."""
    match = re.search(r'(?:Merging formats into|Destination):\s*["\']?(?P<path>.+?)["\']?$', out_text, re.MULTILINE)
    
    if binary == "ytarchive" and "Final file:" in out_text:
        return out_text.split("Final file:")[-1].strip()
    elif binary == "ytdlp" and match:
        return match.group('path').strip()
    return None

async def _process_stream_line(
    uid: str, 
    data: Dict[str, Any], 
    line: str, 
    progress_re: re.Pattern, 
    stream_name: str
):
    """Handles parsing and logging for a single line from stdout/stderr."""
    if not data.get("started_log", False):
        if data.get("status") == TaskStatus.PENDING.value:
             data["status"] = TaskStatus.ACTIVE.value
        data["started_log"] = True

    logger.debug(f"[{uid}] {stream_name}: {line}") 
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

async def run_download(uid: str):
    """
    Main function to execute the download command, stream output,
    update task state, and execute callbacks.
    """
    if uid not in tasks:
        logger.error(f"[{uid}] Task ID not found in tasks dictionary. Aborting.")
        return 

    data: Dict[str, Any] = tasks[uid]
    cmd = data["cmd"]

    logger.info(f"[{uid}] Starting task (Status: {TaskStatus(data.get('status', TaskStatus.PENDING)).name})")
    logger.info(f"[{uid}] Executing command:\n{cmd}")
    
    progress_re = re.compile(r"(?:^\d+:\s+)?\[download\].+(?: at |ETA|\%)")

    async def handle_stream(stream: asyncio.StreamReader, callback: Callable[[str], Awaitable[None]]):
        while True:
            try:
                chunk = await stream.readline()
                if not chunk:
                    break
                decoded = chunk.decode("utf-8", errors="replace")
            except Exception as e:
                logger.error(f"[{uid}] Stream reading error: {e}", exc_info=True)
                break
                
            line = decoded.replace('\r', '').strip()
            if line:
                await callback(line)

    async def handle_stdout(line: str):
        """Processes standard output for progress tracking and logging."""
        await _process_stream_line(uid, data, line, progress_re, "STDOUT")

    async def handle_stderr(line: str):
        """Processes standard error for errors and logging."""
        await _process_stream_line(uid, data, line, progress_re, "STDERR")

    proc = None
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        data["process"] = proc
        data["status"] = TaskStatus.ACTIVE.value
        
    except Exception:
        launch_error = f"\n\n[SYSTEM ERROR] Failed to launch subprocess:\n{traceback.format_exc()}"
        logger.exception(f"[{uid}] Critical error during process creation.")
        
        data["progress_log"] = data.get("progress_log", "") + launch_error
        data["completed"] = True
        data["status"] = TaskStatus.ERROR.value
        data["final_log"] = data["progress_log"]
        return

    t_out = asyncio.create_task(handle_stream(proc.stdout, handle_stdout))
    t_err = asyncio.create_task(handle_stream(proc.stderr, handle_stderr))
    logger.info(f"[{uid}] Waiting for process to finish...")
    await asyncio.gather(t_out, t_err)
    rc = await proc.wait()
    data["completed"] = True

    if rc != 0:
        logger.error(f"[{uid}] Process **failed** with return code: {rc}")
        data["status"] = TaskStatus.ERROR.value
    else:
        logger.info(f"[{uid}] Process exited successfully with return code: {rc}")
        data["status"] = TaskStatus.DONE.value

    data["final_log"] = data["progress_log"]

    if callbacks and data.get("callbacks"):
        logger.info(f"[{uid}] Executing callbacks: {data['callbacks']}")
        final_file = extract_final_file_path(data["final_log"], data["binary"])
        
        if not final_file:
            logger.warning(f"[{uid}] Final file path not detected. Callbacks skipped.")
        
        if final_file:
            logger.info(f"[{uid}] Final file path detected: {final_file}")
            for cb_id in data["callbacks"]:
                try:
                    logger.info(f"[{uid}] Running callback {cb_id}")
                    result = callbacks[cb_id](final_file)
                    current_log = data["final_log"]

                    if "front" in result and result["front"]:
                        for key, block in result["front"].items():
                            current_log = f"{key}:\n{block['out']}\n\n{current_log}"
                            if block.get("err"):
                                current_log = f"{key} ERROR:\n{block['err']}\n\n{current_log}"
                    
                    if "end" in result and result["end"]:
                        for key, block in result["end"].items():
                            current_log += f"\n\n{key}:\n{block['out']}"
                            if block.get("err"):
                                current_log += f"\n\n{key} ERROR:\n{block['err']}"

                    data["final_log"] = current_log
                    logger.info(f"[{uid}] Callback {cb_id} executed successfully.")

                except Exception:
                    logger.exception(f"[{uid}] Callback {cb_id} failed unexpectedly.")
                    
                    callback_error = f"\n\n[CALLBACK ERROR: {cb_id}]\n{traceback.format_exc()}"
                    data["final_log"] += callback_error 
                    
                    if data["status"] == TaskStatus.DONE.value:
                         data["status"] = TaskStatus.WARNING.value

    logger.info(f"[{uid}] Task finished with final status: {TaskStatus(data['status']).name}")
