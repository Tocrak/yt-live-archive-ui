import logging
from logging.config import dictConfig

def setup_logging():
    dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "level": "INFO",
            }
        },
        "root": {"handlers": ["console"], "level": "INFO"},
        "loggers": {
            "uvicorn.error": {"level": "WARNING"},
            "uvicorn.access": {"level": "WARNING"},
            "uvicorn": {"level": "WARNING"},
            "asyncio": {"level": "WARNING"},
        },
    })
