import asyncio
import logging
import os

from fastapi import APIRouter, Response, HTTPException
from typing import Dict, Any, List
from config.dependencies import tasks
from config.schemas import UpdateYtDlpResponse
from services.binary_manager import get_ytdlp

logger = logging.getLogger("app")
router = APIRouter()

try:
    from callbacks import callbacks
except ImportError:
    callbacks = None

@router.post("/update-ytdlp", response_model=UpdateYtDlpResponse)
async def update_ytdlp():
    """Updates the yt-dlp binary, provided no yt-dlp tasks are running."""
    for uid, data in tasks.items():
        if data["binary"] == "ytdlp" and not data["completed"]:
            raise HTTPException(
                status_code=409, 
                detail=f"Cannot update yt-dlp: task '{uid}' is still running."
            )

    try:
        get_ytdlp()
        return {"status": "success", "message": "yt-dlp updated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

@router.get("/cookie")
async def cookie():
    """Checks for the presence of a cookie file."""
    if "COOKIE_FILE" in os.environ:
        file_path = os.environ["COOKIE_FILE"]
    else:
        file_path = "./cookie.txt"

    if os.path.isfile(file_path):
        return Response(status_code=200)
    return Response(status_code=404)

@router.get("/callbacks", response_model=None)
async def callbacks_list() -> List[str] | Response:
    """Returns a list of available callback IDs."""
    if not callbacks:
        return Response(status_code=404)
    return [x for x in callbacks]
