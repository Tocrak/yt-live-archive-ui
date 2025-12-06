from enum import IntEnum
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import asyncio

class TaskStatus(IntEnum):
    """
    Defines the authoritative status codes for a download task.
    Using IntEnum ensures codes are treated as integers in the API.
    """
    DONE = 1
    ERROR = 2
    WARNING = 4
    ACTIVE = 5
    PENDING = 6

class TaskInternal:
    """Internal structure for the tasks dictionary."""
    binary: str
    cmd: str
    process: Optional[asyncio.subprocess.Process]
    task: Optional[asyncio.Task]
    progress_log: str
    active: bool
    completed: bool
    output: Dict[str, str]
    callbacks: List[str]
    started_log: bool

class Output(BaseModel):
    """Output log structure for a completed or active task."""
    out: str
    err: Optional[str] = None

class TaskStatusResponseItem(BaseModel):
    """The structure of a single item in the /status response."""
    # 1: done, 2: error, 4: warning, 5: active/downloading, 6: pending/starting
    status: int = Field(..., description="Status code of the task.")
    output: Output
    isUnfinished: bool = Field(False, description="Always False for this implementation's response structure.")

class RecordRequest(BaseModel):
    """Request body for starting a new download/record task."""
    youtubeID: str = Field(..., description="The ID of the YouTube video (e.g., 'dQw4w9WgXcQ').")
    quality: str = Field(..., description="The desired quality (e.g., '1080p', 'audio_only', 'best').")
    binary: str = Field(..., description="The binary to use ('ytdlp' or 'ytarchive').")
    params: Dict[str, Any] = Field({}, description="Dictionary of CLI parameters for the binary.")
    callbacks: Optional[List[str]] = Field(None, description="List of callback function IDs to run on completion.")

class StatusDeleteRequest(BaseModel):
    """Request body for deleting a task from the status list."""
    id: str = Field(..., description="The unique ID of the task to delete.")

class UpdateYtDlpResponse(BaseModel):
    """Response structure for the yt-dlp update endpoint."""
    status: str
    message: str
