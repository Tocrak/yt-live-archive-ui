import os
import falcon
import fcntl
import json
import sys
import select
from io import BytesIO
from pathlib import Path

import multiprocessing
import subprocess
import threading
import shlex
import queue
from multiprocessing.pool import ThreadPool

import urllib.request
import shutil

import traceback
from zipfile import ZipFile

if os.path.isfile("./callbacks.py"):
    from callbacks import callbacks
else:
    callbacks = None

pool = ThreadPool(processes=int(os.getenv('PROCESSES', multiprocessing.cpu_count())))

# ----- ytarchive get -----
def get_ytarchive():
    url = "https://github.com/Kethsar/ytarchive/releases/latest/download/ytarchive_linux_amd64.zip"
    with urllib.request.urlopen(url) as resp:
        with ZipFile(BytesIO(resp.read())) as zfile:
            zfile.extractall('./')
    subprocess.call("chmod +x ./ytarchive", shell=True)

if 'YTARCHIVE_BIN' in os.environ:
    ytarchive_path = Path(os.environ['YTARCHIVE_BIN'])
    print("[INFO] Using YTARCHIVE_BIN env variable")
    if ytarchive_path.is_file():
        print("[INFO] Using ytarchive binaries")
    else:
        print("[INFO] ytarchive not found. Downloading...")
        get_ytarchive()
else:
    ytarchive_path = Path("./ytarchive")
    print("[WARN] No YTARCHIVE_BIN env variable set. Checking local")
    if ytarchive_path.is_file():
        print("[INFO] Using local ytarchive binaries")
    else:
        print("[INFO] ytarchive not found. Downloading...")
        get_ytarchive()
# ----- ytarchive get END -----

# ----- ytdlp get -----
def get_ytdlp():
    url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    urllib.request.urlretrieve(url, './yt-dlp')
    subprocess.call("chmod +x ./yt-dlp", shell=True)

if 'YTDLP_BIN' in os.environ:
    ytarchive_path = Path(os.environ['YTDLP_BIN'])
    print("[INFO] Using YTDLP_BIN env variable")
    if ytarchive_path.is_file():
        print("[INFO] Using yt-dlp binaries")
    else:
        print("[INFO] yt-dlp not found. Downloading...")
        get_ytdlp()
else:
    ytarchive_path = Path("./yt-dlp")
    print("[WARN] No YTDLP_BIN env variable set. Checking local")
    if ytarchive_path.is_file():
        print("[INFO] Using local yt-dlp binaries")
    else:
        print("[INFO] yt-dlp not found. Downloading...")
        get_ytdlp()
# ----- ytdlp get END -----

def archive_ytarchive(url, quality, params={}, callback_ids=[], on_callback=None, on_main_finished=None):
    download_location = '/downloads/'

    if 'YTARCHIVE_BIN' in os.environ:
        cmd = os.environ['YTARCHIVE_BIN']
    else:
        cmd = "./ytarchive"

    for k, v in params.items():
        if type(v) == bool:
            cmd += f" {k}"
        elif k == '--output':
            cmd += f" {k} '{download_location}{v}'"
        else:
            cmd += f" {k} '{v}'"
    cmd += f" {url} {quality}"

    print(f"[INFO] Archiving the livestream via ytarchive: {cmd}")
    p = subprocess.Popen(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    yield p
    out, err = p.communicate()
    
    if type(out) == bytes:
        out = out.decode(sys.stdout.encoding)
    if type(err) == bytes:
        err = err.decode(sys.stdout.encoding)

    if on_main_finished:
        on_main_finished(url, quality, params, callback_ids, on_callback)

    if callbacks and callback_ids:
        filepath = out.split("Final file: ")[-1].rstrip()
        filepath = os.path.abspath(filepath)

        for callback_id_index in range(len(callback_ids)):
            callback_id = callback_ids[callback_id_index]
            if len(err):
                err += f"\n\n [INFO] Queued callback id: {callback_id}"
                yield (out, err, True)
                err = ''

            if on_callback:
                on_callback(callback_id_index)
            
            tmp = callbacks[callback_id](filepath)

            if "front" in tmp and tmp["front"]:
                for key in tmp["front"]:
                    _out = tmp["front"][key]["out"]
                    _err = tmp["front"][key]["err"]

                    out = f"{key}:\n{_out}\n\n{out}" 
                    if len(tmp["front"][key]["err"]):
                        err = f"{key}:\n{_err}\n\n{err}" 
            
            if "end" in tmp and tmp["end"]:
                for key in tmp["end"]:
                    _out = tmp["end"][key]["out"]
                    _err = tmp["end"][key]["err"]

                    out += f"\n\n{key}:\n{_out}" 
                    if len(tmp["end"][key]["err"]):
                        err += f"\n\n{key}:\n{_err}" 
        
    yield (out, err, False)

def archive_ytdlp(url, quality, params={}, callback_ids=[], on_callback=None, on_main_finished=None):
    download_location = '/downloads/'

    if 'YTDLP_BIN' in os.environ:
        cmd = os.environ['YTDLP_BIN']
    else:
        cmd = "./yt-dlp"

    for k, v in params.items():
        if k == '--mkv':
            if quality != "audio_only":
                cmd += f" --remux-video mkv --merge-output-format mkv"
        elif k == '--retry-stream':
            cmd += f" --wait-for-video {v}"
        elif k == '--thumbnail':
            cmd += f" --embed-thumbnail"
        elif k == '--threads':
            cmd += f" --concurrent-fragments {v}"
        elif k == '--wait':
            cmd += f" --live-from-start"
        elif k == '--output':
            cmd += f" {k} '{v}'"
        elif type(v) == bool:
            cmd += f" {k}"
        else:
            cmd += f" {k} '{v}'"
    
    cmd += f" --paths '{download_location}'"
    if quality == "audio_only":
        cmd += f" -x --extract-audio"
    elif quality != "best":
        cmd += f" -f bestvideo[height={quality[:-1]}]"
    cmd += f" {url}"

    print(f"[INFO] Archiving the livestream via yt-dlp: {cmd}")
    p = subprocess.Popen(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    yield p
    out, err = p.communicate()
    
    if type(out) == bytes:
        out = out.decode(sys.stdout.encoding)
    if type(err) == bytes:
        err = err.decode(sys.stdout.encoding)

    if on_main_finished:
        on_main_finished(url, quality, params, callback_ids, on_callback)

    if callbacks and callback_ids:
        filepath = out.split("Final file: ")[-1].rstrip()
        filepath = os.path.abspath(filepath)

        for callback_id_index in range(len(callback_ids)):
            callback_id = callback_ids[callback_id_index]
            if len(err):
                err += f"\n\n [INFO] Queued callback id: {callback_id}"
                yield (out, err, True)
                err = ''

            if on_callback:
                on_callback(callback_id_index)
            
            tmp = callbacks[callback_id](filepath)

            if "front" in tmp and tmp["front"]:
                for key in tmp["front"]:
                    _out = tmp["front"][key]["out"]
                    _err = tmp["front"][key]["err"]

                    out = f"{key}:\n{_out}\n\n{out}" 
                    if len(tmp["front"][key]["err"]):
                        err = f"{key}:\n{_err}\n\n{err}" 
            
            if "end" in tmp and tmp["end"]:
                for key in tmp["end"]:
                    _out = tmp["end"][key]["out"]
                    _err = tmp["end"][key]["err"]

                    out += f"\n\n{key}:\n{_out}" 
                    if len(tmp["end"][key]["err"]):
                        err += f"\n\n{key}:\n{_err}" 
        
    yield (out, err, False)

statuses = {}

def get_id(x):
    if x not in statuses:
        return x

    i = 0
    while True:
        tmp = f"{x}.{i}"
        if tmp not in statuses:
            return tmp
        i += 1

def add_task(uid, process, task, binary, callback=False):
    global statuses
    if uid in statuses:
        statuses[uid]["task"] = task
    else:
        if not callback:
            statuses[uid] = {"task": task}
        else:
            statuses[uid] = {
                "binary": binary,
                "task": task, 
                "process": process,
                "active": False,
                "early_log": "",
                "callbacks": {
                    "queue": [],
                    "current": -1
                }
            }

class Status:
    def on_get(self, req, resp):
        global statuses
        resp.media = {}

        for uid in statuses:
            t = statuses[uid]["task"]
            if t.ready():
                try:
                    out, err, is_unfinished = t.get()
                    if "ERROR:" in err:
                        status = 2 # Error status
                    elif err.strip():
                        status = 4 # Warning status
                    else:
                        status = 1 # Done status
                    resp.media[uid] = {
                        "status": status,
                        "output": {"out": statuses[uid]["early_log"] + out, "err": err},
                        "isUnfinished": is_unfinished
                    }
                except Exception as err:
                    resp.media[uid] = {
                        "status": 2, # Error status
                        "output": {"out": None, "err": traceback.format_exc()},
                        "isUnfinished": False
                    }
            elif ("callbacks" in statuses[uid]) and statuses[uid]["callbacks"]["current"] != -1:
                resp.media[uid] = {
                    "status": 3, # Callback status
                    "callbacks": statuses[uid]["callbacks"]
                }
            else:                
                if statuses[uid]["binary"] != "ytarchive" and not statuses[uid].get("active"):
                    process = statuses[uid]["process"]
                    fd = process.stdout.fileno()
                    try:
                        chunk = os.read(fd, 4096)
                        if chunk:
                            text = chunk.decode('utf-8', errors='replace')
                            statuses[uid]["early_log"] += text
                            if "[download]" in text or "Downloaded" in text:
                                statuses[uid]["active"] = True
                    except BlockingIOError:
                        # No data available right now
                        pass
                    except Exception as e:
                        print(f"Error reading stdout for {uid}: {e}")

                status = 5 if statuses[uid].get("active") else 6
                resp.media[uid] = {
                        "status": status,
                        "output": {"out": statuses[uid]["early_log"], "err": None},
                        "isUnfinished": False
                    }

        resp.status = falcon.HTTP_200

    def on_delete(self, req, resp):
        global statuses

        uid = req.media.get('id')
        statuses.pop(uid, None)

        resp.status = falcon.HTTP_200

class Record:
    def on_post(self, req, resp):
        global pool

        youtube_id = req.media.get('youtubeID')
        url = f"https://youtu.be/{youtube_id}"
        quality = req.media.get('quality')
        params = req.media.get('params')
        binary = req.media.get('binary')

        uid = get_id(youtube_id)

        callback_ids = req.media.get('callbacks') if callbacks else []

        if callback_ids:
            def on_callback(callback_index):
                statuses[uid]["callbacks"]["current"] = callback_index
            def on_main_finished(url, quality, params, callback_ids, on_callback):
                statuses[uid]["callbacks"]["queue"] = callback_ids
        else:
            on_callback = None
            on_main_finished = None
        
        process = None
        if (binary == 'ytarchive'):
            archive_gen = archive_ytarchive(url, quality, params, callback_ids, on_callback, on_main_finished)
        else:
            archive_gen = archive_ytdlp(url, quality, params, callback_ids, on_callback, on_main_finished)

        process = next(archive_gen)
        task = pool.apply_async(lambda: next(archive_gen))
        add_task(uid, process, task, binary, callback=True)
        statuses[uid]["generator"] = archive_gen

        resp.media = {'id': uid}
        resp.status = falcon.HTTP_200

class Website:
    def on_get(self, req, resp):
        resp.status = falcon.HTTP_200
        resp.content_type = "text/html"
        with open("./index.html", "rb") as f:
            resp.text = f.read()

class CookieAvailable:
    def on_get(self, req, resp):
        if 'COOKIE_FILE' in os.environ:
            file_path = os.environ['COOKIE_FILE']
        else:
            file_path = "./cookie.txt"

        if os.path.isfile(file_path):
            resp.status = falcon.HTTP_302
        else:
            resp.status = falcon.HTTP_404

class Reboot:
    def on_get(self, req, resp):
        resp.status = falcon.HTTP_200
        sys.exit(0)

class Callbacks:
    def on_get(self, req, resp):
        if callbacks:
            resp.media = [x for x in callbacks]
            resp.status = falcon.HTTP_200
        else:
            resp.status = falcon.HTTP_404

class Callback:
    def on_get(self, req, resp):
        uid = req.get_param('id')
        t = pool.apply_async(lambda: next(statuses[uid]["generator"]))
        add_task(uid, t)

        resp.status = falcon.HTTP_200
    
api = falcon.App()
api.add_route('/status', Status())
api.add_route('/record', Record())
api.add_route('/cookie', CookieAvailable())
api.add_route('/callbacks', Callbacks())
api.add_route('/callback', Callback())
api.add_route('/reboot', Reboot())
api.add_route('/', Website())
