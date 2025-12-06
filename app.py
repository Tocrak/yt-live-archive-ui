import os
import sys
import logging
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from logging_config import setup_logging
setup_logging()
logger = logging.getLogger("app")

from binary_manager import initialize_binaries
from routers import status, downloader, utils

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(downloader.router)
app.include_router(status.router)
app.include_router(utils.router)

@app.get("/reboot")
async def reboot():
    """Triggers an application exit, useful for containerized environments to restart."""
    logger.critical("Reboot endpoint called. Exiting application.")
    os._exit(0)

@app.get("/")
async def index():
    """Serves the main frontend application file."""
    return FileResponse("static/index.html")
