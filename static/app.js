let statusIntervalId;
let notifyTimeoutId;
const collapsedLogs = new Set(JSON.parse(localStorage.getItem('collapsedLogs') || '[]'));
let existingTaskIds = new Set();
let taskElements = new Map();
const TASK_STATUS_MAP = {
    1: "Done",
    2: "Error",
    4: "Warning",
    5: "Active",
    6: "Starting"
};

document.addEventListener("DOMContentLoaded", () => {
    loadDefaults();
    document.getElementById("startBtn").onclick = startDownload;
    const updateBtn = document.getElementById("updateYtdlpBtn");
    if (updateBtn) {
        updateBtn.onclick = updateYtdlp;
    }
    loadCallbacks();
    loadStatus();
    startStatusInterval();
    const youtubeIDInput = document.getElementById("youtubeID");
    youtubeIDInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault(); 
            startDownload();
        }
    });
});

function loadDefaults() {
    loadParametersFromStorage();
    setupParameterListeners();
}

function saveParameters() {
    localStorage.setItem("binary", document.getElementById("binary").value);
    localStorage.setItem("downloadQuality", document.getElementById("quality").value);
    localStorage.setItem("downloadThumbnail", document.getElementById("thumbnail").checked);
    localStorage.setItem("downloadWait", document.getElementById("wait").checked);
    localStorage.setItem("downloadMkv", document.getElementById("mkv").checked);
    localStorage.setItem("youtubeCookies", document.getElementById("youtubeCookies").checked);
    localStorage.setItem("downloadOutput", document.getElementById("output").value.trim());
    localStorage.setItem("downloadRetryStream", document.getElementById("retryStream").value.trim());
    localStorage.setItem("downloadThreads", document.getElementById("threads").value.trim());
    localStorage.setItem("refreshInterval", document.getElementById("refreshInterval").value);
}

function loadParametersFromStorage() {
    const qualityInput = document.getElementById("quality");
    const thumbnailInput = document.getElementById("thumbnail");
    const waitInput = document.getElementById("wait");
    const mkvInput = document.getElementById("mkv");
    const youtubeCookiesInput = document.getElementById("youtubeCookies");
    const outputInput = document.getElementById("output");
    const retryInput = document.getElementById("retryStream");
    const threadsInput = document.getElementById("threads");
    const binaryInput = document.getElementById("binary");
    const refreshIntervalSelect = document.getElementById("refreshInterval");

    qualityInput.value = localStorage.getItem("downloadQuality") || "best";
    thumbnailInput.checked = localStorage.getItem("downloadThumbnail") === "true" || localStorage.getItem("downloadThumbnail") === null;
    waitInput.checked = localStorage.getItem("downloadWait") === "true" || localStorage.getItem("downloadWait") === null;
    mkvInput.checked = localStorage.getItem("downloadMkv") === "true" || localStorage.getItem("downloadMkv") === null;
    youtubeCookiesInput.checked = localStorage.getItem("youtubeCookies") === "true";
    outputInput.value = localStorage.getItem("downloadOutput") || "%(channel)s - %(title)s";
    retryInput.value = localStorage.getItem("downloadRetryStream") || "60";
    threadsInput.value = localStorage.getItem("downloadThreads") || "2";
    binaryInput.value = localStorage.getItem("binary") || "ytdlp";
    
    if (refreshIntervalSelect) {
        refreshIntervalSelect.value = localStorage.getItem("refreshInterval") || "2";
    }
}

function setupParameterListeners() {
    const qualityInput = document.getElementById("quality");
    const thumbnailInput = document.getElementById("thumbnail");
    const waitInput = document.getElementById("wait");
    const mkvInput = document.getElementById("mkv");
    const youtubeCookiesInput = document.getElementById("youtubeCookies");
    const outputInput = document.getElementById("output");
    const retryInput = document.getElementById("retryStream");
    const threadsInput = document.getElementById("threads");
    const binaryInput = document.getElementById("binary");
    const refreshIntervalSelect = document.getElementById("refreshInterval");

    qualityInput.addEventListener("change", saveParameters);
    thumbnailInput.addEventListener("change", saveParameters);
    waitInput.addEventListener("change", saveParameters);
    mkvInput.addEventListener("change", saveParameters);
    youtubeCookiesInput.addEventListener("change", saveParameters);
    outputInput.addEventListener("change", saveParameters);
    retryInput.addEventListener("change", saveParameters);
    threadsInput.addEventListener("change", saveParameters);
    binaryInput.addEventListener("change", saveParameters);

    if (refreshIntervalSelect) {
        refreshIntervalSelect.addEventListener("change", function() {
            saveParameters();
            startStatusInterval();
        });
    }
}

function startStatusInterval() {
    if (statusIntervalId) {
        clearInterval(statusIntervalId);
    }
    const intervalSeconds = parseInt(localStorage.getItem("refreshInterval") || "2");
    const intervalMs = intervalSeconds * 1000;
    statusIntervalId = setInterval(loadStatus, intervalMs);
}

function extractVideoId(input) {
    try {
        const url = new URL(input);
        if (url.hostname.includes("youtube")) {
            return url.searchParams.get("v");
        }
        if (url.hostname.includes("youtu.be")) {
            return url.pathname.substring(1);
        }
        if (url.hostname.includes("holodex.net")) {
            return url.pathname.split("/").pop();
        }
    } catch (e) {
        console.warn("Raw video ID used")
    }
    return input.trim();
}

function trimLeadingBlankLines(text) {
    let cleanedText = text.replace(/^(?:\s*\n)+/, "");
    cleanedText = cleanedText.replace(/^[\s\xA0]+/, "");
    return cleanedText;
}

function notify(msg, type = 'success') {
    const n = document.getElementById("notice");
    if (notifyTimeoutId) {
        clearTimeout(notifyTimeoutId);
    }
    n.textContent = msg;
    n.className = "notice"; 
    if (type === 'error') {
        n.classList.add("error");
    }
    n.style.display = "block";

    notifyTimeoutId = setTimeout(() => {
        n.style.display = "none";
        notifyTimeoutId = null;
    }, 2000);
}

async function loadCallbacks() {
    const row = document.getElementById("callbackRow");
    const list = document.getElementById("callbackList");
    const resp = await fetch("/callbacks");
    if (!resp.ok) return;
    const data = await resp.json();
    row.style.display = "block";
    for (const cb of data) {
        const div = document.createElement("div");
        div.innerHTML = `
            <label>
                <input type="checkbox" value="${cb}"> ${cb}
            </label>
        `;
        list.appendChild(div);
    }
}

async function startDownload() {
    const youtubeIDInput = document.getElementById("youtubeID");
    const youtubeID = extractVideoId(youtubeIDInput.value.trim());
    if (!youtubeID) {
        notify("Enter a YouTube ID or URL", 'error');
        return;
    }
    youtubeIDInput.value = "";
    const body = {
        youtubeID,
        quality: document.getElementById("quality").value,
        binary: document.getElementById("binary").value,
        params: {},
        callbacks: []
    };
    const threads = document.getElementById("threads").value.trim();
    if (threads) body.params["--threads"] = threads;
    const retry = document.getElementById("retryStream").value.trim();
    if (retry) body.params["--retry-stream"] = retry;
    if (document.getElementById("thumbnail").checked)
        body.params["--thumbnail"] = true;
    if (document.getElementById("mkv").checked)
        body.params["--mkv"] = true;
    if (document.getElementById("wait").checked)
        body.params["--wait"] = true;
    if (document.getElementById("youtubeCookies").checked)
        body.params["--cookies"] = true;
    const output = document.getElementById("output").value.trim();
    if (output) body.params["--output"] = output;
    document.querySelectorAll("#callbackList input[type=checkbox]:checked")
        .forEach(cb => body.callbacks.push(cb.value));
    const resp = await fetch("/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    notify("Task started: " + data.id);
}

async function updateYtdlp() {
    notify("Starting yt-dlp update...", 'warning');

    const resp = await fetch("/update-ytdlp", { method: "POST" });
    const data = await resp.json();

    if (resp.ok) {
        notify(data.message); 
    } else {
        notify(data.message, 'error'); 
    }
    loadStatus(); 
}

async function loadStatus() {
    const scrollY = window.scrollY;
    const resp = await fetch("/status");
    const data = await resp.json();
    const container = document.getElementById("taskList");
    const incomingTaskIds = new Set(Object.keys(data));
    const sortedUids = Array.from(incomingTaskIds).sort(); 
    
    existingTaskIds.forEach(uid => {
        if (!incomingTaskIds.has(uid)) {
            const taskElement = taskElements.get(uid);
            if (taskElement) {
                const removeBtn = taskElement.querySelector(".remove-btn");
                const existingTimeoutId = removeBtn ? removeBtn.dataset.confirmTimeoutId : null;
                if (existingTimeoutId) {
                    clearTimeout(existingTimeoutId);
                }
                
                taskElement.remove();
                taskElements.delete(uid);
            }
        }
    });
    
    existingTaskIds.clear(); 
    
    for (const uid of sortedUids) {
        existingTaskIds.add(uid);
        const rec = data[uid];
        const logId = `log-${uid}`;
        const statusText = TASK_STATUS_MAP[rec.status] || rec.status;
        const currentLogText = trimLeadingBlankLines(rec.output.out || "").replace(/\n/g, "<br>");
        let isCollapsed = collapsedLogs.has(logId);
        let taskDiv = taskElements.get(uid);
        
        if (!taskDiv) {
            taskDiv = document.createElement("div");
            taskDiv.className = "task";
            taskDiv.dataset.id = uid;

            taskDiv.innerHTML = `
                <div class="task-header">
                    <strong>${uid}</strong>
                    <span class="task-status">${statusText}</span>
                    <button class="remove-btn" data-id="${uid}">Remove</button>
                </div>

                <div class="log-toggle" data-target="${logId}">
                    ${isCollapsed ? '▶ Logs' : '▼ Logs'}
                </div>

                <div id="${logId}" class="log ${isCollapsed ? '' : 'expanded'}" data-auto-scroll="true">${currentLogText}</div>
            `;
            
            taskElements.set(uid, taskDiv);
            container.appendChild(taskDiv);
            attachEventHandlersForNewTask(taskDiv);
            
        } else {
            taskDiv.querySelector('.task-status').textContent = statusText;
            const logDiv = taskDiv.querySelector(`#${logId}`);
            const logToggle = taskDiv.querySelector('.log-toggle');

            if (logDiv.innerHTML !== currentLogText) {
                 logDiv.innerHTML = currentLogText;
            }

            const shouldBeExpanded = !isCollapsed;
            const isCurrentlyExpanded = logDiv.classList.contains('expanded');

            if (shouldBeExpanded && !isCurrentlyExpanded) {
                logDiv.classList.add('expanded');
                logToggle.textContent = "▼ Logs";
                logDiv.dataset.autoScroll = "true";
            } else if (!shouldBeExpanded && isCurrentlyExpanded) {
                logDiv.classList.remove('expanded');
                logToggle.textContent = "▶ Logs";
            }
        }

        const logDiv = taskDiv.querySelector(`#${logId}`);
        const shouldAutoScroll = logDiv.dataset.autoScroll === "true";
        if (!isCollapsed && logDiv && shouldAutoScroll) {
             logDiv.scrollTop = logDiv.scrollHeight;
        }
    }
        
    window.scrollTo(0, scrollY);
}

function attachEventHandlersForNewTask(taskElement) {
    const btn = taskElement.querySelector(".remove-btn");
    
    if (!window.removeTaskHandler) {
         window.removeTaskHandler = async function() {
            const btn = this;
            const taskId = btn.dataset.id;
            
            if (btn.classList.contains('confirm-state')) {
                
                const existingTimeoutId = btn.dataset.confirmTimeoutId;
                if (existingTimeoutId) {
                    clearTimeout(existingTimeoutId);
                    delete btn.dataset.confirmTimeoutId;
                }
                
                const taskElement = btn.closest(".task");
                const resp = await fetch("/status", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: taskId })
                });

                if (resp.ok) {
                    taskElement.remove();
                    taskElements.delete(taskId); 
                    collapsedLogs.delete(`log-${taskId}`);
                    localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(collapsedLogs)));
                    notify(`Task deleted: ${taskId}`);
                } else {
                    console.error(`Failed to delete task ${taskId}. Status: ${resp.status}`);
                    notify(`Error deleting task ${taskId}. Status: ${resp.status}`, 'error');
                    btn.classList.remove('confirm-state');
                    btn.textContent = 'Remove';
                }
            } else {
                const existingTimeoutId = btn.dataset.confirmTimeoutId;
                if (existingTimeoutId) {
                    clearTimeout(existingTimeoutId);
                }

                btn.classList.add('confirm-state');
                btn.textContent = 'Confirm';
                
                const timeoutId = setTimeout(() => {
                    btn.classList.remove('confirm-state');
                    btn.textContent = 'Remove';
                    delete btn.dataset.confirmTimeoutId;
                }, 3000);

                btn.dataset.confirmTimeoutId = timeoutId;
            }
        };
    }
    
    if (btn) {
        btn.addEventListener('click', window.removeTaskHandler);
    }

    const tgl = taskElement.querySelector(".log-toggle");
    const logDiv = taskElement.querySelector(`#${tgl.dataset.target}`);
    if (logDiv) {
        logDiv.addEventListener('scroll', () => {
            const scrollTolerance = 5;
            const isScrolledToBottom = (logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight) < scrollTolerance;
            
            if (isScrolledToBottom) {
                logDiv.dataset.autoScroll = "true";
            } else {
                logDiv.dataset.autoScroll = "false";
            }
        });
    }
    if (tgl) {
        tgl.onclick = () => {
            const log = document.getElementById(tgl.dataset.target);
            const isOpen = log.classList.contains("expanded");
            
            if (isOpen) {
                log.classList.remove("expanded");
                collapsedLogs.add(log.id); 
                tgl.textContent = "▶ Logs";
            } else {
                log.classList.add("expanded");
                collapsedLogs.delete(log.id); 
                tgl.textContent = "▼ Logs";
                log.scrollTop = log.scrollHeight;
                log.dataset.autoScroll = "true";
            }
            localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(collapsedLogs)));
        };
    }
}
