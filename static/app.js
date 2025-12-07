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
const parameterConfig = [
    { storageKey: "binary", elementId: "binary", defaultValue: "ytdlp", type: "value" },
    { storageKey: "downloadQuality", elementId: "quality", defaultValue: "best", type: "value" },
    { storageKey: "downloadThumbnail", elementId: "thumbnail", defaultValue: true, type: "checked" },
    { storageKey: "downloadWait", elementId: "wait", defaultValue: true, type: "checked" },
    { storageKey: "downloadMkv", elementId: "mkv", defaultValue: true, type: "checked" },
    { storageKey: "youtubeCookies", elementId: "youtubeCookies", defaultValue: false, type: "checked" },
    { storageKey: "downloadOutput", elementId: "output", defaultValue: "%(channel)s - %(title)s", type: "value" },
    { storageKey: "downloadRetryStream", elementId: "retryStream", defaultValue: "60", type: "value" },
    { storageKey: "downloadThreads", elementId: "threads", defaultValue: "1", type: "value" },
    { storageKey: "refreshInterval", elementId: "refreshInterval", defaultValue: "2", type: "value", isOptional: true },
];

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

function loadParameters() {
    parameterConfig.forEach(config => {
        const element = document.getElementById(config.elementId);
        if (!element && config.isOptional) return;
        if (!element) {
            console.warn(`Element with ID '${config.elementId}' not found.`);
            return;
        }
        const storedValue = localStorage.getItem(config.storageKey);

        if (config.type === "checked") {
            const defaultCheck = config.defaultValue;
            element.checked = storedValue !== null 
                ? storedValue === "true" 
                : defaultCheck;
        } else if (config.type === "value") {
            const isStoredValueValid = storedValue && storedValue.trim() !== "";
            element.value = isStoredValueValid
                ? storedValue.trim()
                : config.defaultValue;
        }
    });
}

function saveParameters() {
    parameterConfig.forEach(config => {
        const element = document.getElementById(config.elementId);
        if (!element) {
            return;
        }
        let valueToSave;

        if (config.type === "checked") {
            valueToSave = element.checked.toString();
        } else if (config.type === "value") {
            valueToSave = element.value.trim();
        }

        localStorage.setItem(config.storageKey, valueToSave);
    });
}

function setupListeners() {
    parameterConfig.forEach(config => {
        const element = document.getElementById(config.elementId);
        if (!element) {
            return;
        }

        if (config.elementId === "refreshInterval") {
            element.addEventListener("change", function() {
                saveParameters();
                if (typeof startStatusInterval === 'function') {
                    startStatusInterval(); 
                }
            });
        } else {
            element.addEventListener("change", saveParameters);
        }
    });
}

function loadDefaults() {
    loadParameters();
    setupListeners();
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

function notify(msg, type = 'success') {
    const n = document.getElementById("notice");
    if (notifyTimeoutId) {
        clearTimeout(notifyTimeoutId);
    }
    n.textContent = msg;
    n.className = "notice"; 
    if (type === 'error') {
        n.classList.add("error");
    } else if (type === 'warning') {
        n.classList.add("warning")
    }
    n.style.display = "block";

    notifyTimeoutId = setTimeout(() => {
        n.style.display = "none";
        notifyTimeoutId = null;
    }, 3000);
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
    if (threads) body.params["threads"] = threads;
    
    const retry = document.getElementById("retryStream").value.trim();
    if (retry) body.params["retry_stream"] = retry; 
    
    if (document.getElementById("thumbnail").checked)
        body.params["embed_thumbnail"] = true;
    
    if (document.getElementById("mkv").checked)
        body.params["force_mkv"] = true;
    
    if (document.getElementById("wait").checked)
        body.params["wait_for_live"] = true;
    
    if (document.getElementById("youtubeCookies").checked)
        body.params["use_cookies"] = true;
    
    const output = document.getElementById("output").value.trim();
    if (output) body.params["output_filename"] = output;

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
        const errorMessage = data.detail || "An unknown error occurred.";
        notify(errorMessage, 'error'); 
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
        const currentLogText = `<br>${(rec.output || "").replace(/\n/g, "<br>")}`;
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
