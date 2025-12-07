import asyncio
import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from config.schemas import RecordRequest
from config.dependencies import tasks
from services.command_builder import build_ytarchive_cmd, build_ytdlp_cmd
from services.task_runner import get_id, run_download

logger = logging.getLogger("app")
router = APIRouter()

@router.post("/record")
async def record(body: RecordRequest) -> Dict[str, str]:
    """Starts a new download/recording task."""
    youtube_id = body.youtubeID
    url = f"https://youtu.be/{youtube_id}"
    quality = body.quality
    params = body.params
    binary = body.binary
    callback_ids = body.callbacks or []
    uid = get_id(youtube_id)

    if uid in tasks:
        raise HTTPException(
            status_code=409,
            detail=f"A task for video ID {youtube_id} (UID: {uid}) already exists. Please remove the previous one if needed."
        )

    if binary == "ytarchive":
        cmd = build_ytarchive_cmd(url, quality, params)
    else:
        cmd = build_ytdlp_cmd(url, quality, params)

    tasks[uid] = {
        "binary": binary,
        "cmd": cmd,
        "process": None,
        "task": None,
        "progress_log": "",
        "active": False,
        "completed": False,
        "output": {"out": "", "err": ""},
        "callbacks": callback_ids
    }

    t = asyncio.create_task(run_download(uid))
    tasks[uid]["task"] = t

    return {"id": uid}
