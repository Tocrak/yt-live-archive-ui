import asyncio
import logging
import os

from fastapi import APIRouter, Request, Response
from typing import Dict
from dependencies import tasks
from schemas import StatusDeleteRequest, TaskStatusResponseItem, TaskStatus

logger = logging.getLogger("app")
router = APIRouter()

@router.get("/status", response_model=Dict[str, TaskStatusResponseItem])
async def status():
    """Returns the status of all active and completed tasks."""
    resp: Dict[str, TaskStatusResponseItem] = {}

    for uid, data in tasks.items():
        if data["completed"]:
            out = data["output"]["out"]
            err = data["output"]["err"]

            if "ERROR:" in err:
                status_code = TaskStatus.ERROR
            elif err.strip():
                status_code = TaskStatus.WARNING
            else:
                status_code = TaskStatus.DONE

            resp[uid] = TaskStatusResponseItem(
                status=status_code,
                output={"out": out, "err": err},
            )
        else:
            status_code = TaskStatus.ACTIVE if data["active"] else TaskStatus.PENDING # Use Enum
            resp[uid] = TaskStatusResponseItem(
                status=status_code,
                output={"out": data["progress_log"]},
            )
    return resp

@router.delete("/status")
async def status_delete(body: StatusDeleteRequest):
    """Deletes a task by ID, terminating it if currently running."""
    uid = body.id

    if uid in tasks:
        data = tasks[uid]
        
        process = data.get("process")
        if process and process.returncode is None:
            logger.warning(f"[{uid}] Terminating process {process.pid}")
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                logger.error(f"[{uid}] Process did not terminate gracefully, sending SIGKILL.")
                process.kill()
            except Exception as e:
                logger.exception(f"[{uid}] Error terminating process: {e}")

        task = data.get("task")
        if task and not task.done():
            task.cancel()
            logger.warning(f"[{uid}] Cancelled asyncio task.")

        tasks.pop(uid)
        logger.info(f"[{uid}] Task entry removed.")
    
    return {}