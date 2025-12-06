## ytarchive-ui 💾📺

Web UI for managing and monitoring media downloads using **ytarchive** or **yt-dlp**.

-----

## Features

  * **Dual Binary Support:** Supports downloads using both **ytarchive** and **yt-dlp**.
  * **Persistent Status:** Tracks download status (Pending, Active, Done, Warning, Error) in the backend, allowing safe page refreshes or closures.
  * **Task Management:** Allows for the **deletion** and **termination** of running tasks via the UI.
  * **Callback System:** Supports optional **post-download callbacks** (`/callbacks`).
  * **Tool Maintenance:** Provides an endpoint to safely **update the yt-dlp binary** (`/update-ytdlp`).
  * **Configuration Checks:** Allows checking for cookie file presence (`/cookie`).
  * **Deployment Utility:** **Container-friendly** with a dedicated `/reboot` endpoint to trigger an application exit.

-----

## Dependencies

The application runs on Python 3 and uses **FastAPI** as the backend framework.

### System Dependencies (Required for Binaries)

The following are essential for the download binaries (`yt-dlp` in particular) to function correctly and are included in the  container environment:

  * **ffmpeg**: Required for merging/remuxing video and audio streams.
  * **quickjs**: A JavaScript engine needed by `yt-dlp` for certain complex site extractions.

### Download Binaries

  * **ytarchive**
  * **yt-dlp**

-----

## Usage

### Configuration

  * To use custom authentication, place your `cookie.txt` file in the application directory. You may also set the environment variable `COOKIE_FILE` to point to a custom path.

### Running the Application

The application is designed to be run using the provided scripts: `run.bat` (Windows) or `run.sh` (\*nix).

The application service exposes **port 8099**.

A successful startup will log:

```
Downloading ytarchive...
Finished.
Starting service...
Serving on <URL>
```

Simply open the URL (on port 8099) and enjoy\!

### Important Notes

  * All downloaded files are saved to the **/downloads** directory within the container/environment.
  * The status of your downloads is maintained in the backend. Feel free to refresh or close the webpage at anytime\!
  * Click on a task's status (Success, Failed, or Warning) to see the full log and output.
