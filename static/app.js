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
    { storageKey: "embed_thumbnail", elementId: "thumbnail", defaultValue: true, type: "checked" },
    { storageKey: "wait_for_live", elementId: "wait", defaultValue: true, type: "checked" },
    { storageKey: "force_mkv", elementId: "mkv", defaultValue: true, type: "checked", isOptional: true },
    { storageKey: "use_cookies", elementId: "youtubeCookies", defaultValue: false, type: "checked" },
    { storageKey: "output_filename", elementId: "output", defaultValue: "%(channel)s - %(title)s", type: "value" },
    { storageKey: "retry_stream", elementId: "retryStream", defaultValue: "60", type: "value" },
    { storageKey: "threads", elementId: "threads", defaultValue: "1", type: "value" },
    { storageKey: "refreshInterval", elementId: "refreshInterval", defaultValue: "2", type: "value", isOptional: true },
    { storageKey: "customParams", elementId: "customParams", defaultValue: "", type: "value", isOptional: true },
];
const FLAG_TO_CANONICAL_MAP = {
    '--output': 'output_filename',
    '-o': 'output_filename',
    // yt-dlp flags
    '--wait-for-video': 'retry_stream',
    '--concurrent-fragments': 'threads',
    '--live-from-start': 'wait_for_live',
    '--embed-thumbnail': 'embed_thumbnail',
    // ytarchive flags
    '--retry-stream': 'retry_stream',
    '--threads': 'threads',
    '--wait': 'wait_for_live',
    '--thumbnail': 'embed_thumbnail',
};
const YTDLP_MKV_HIERARCHY = [
    '--recode-video', 
    '--remux-video', 
    '--merge-output-format'
];
const FORCE_MKV_OVERRIDE_MAP = {
    '--merge-output-format': true,
    '--remux-video': true,
    '--recode-video': true,
    '--mkv': true,
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
        } else if (config.elementId === "customParams") {
            element.addEventListener("input", function() {
                saveParameters();
                updateUiFromCustomParams();
            });
        } else {
            element.addEventListener("change", saveParameters);
        }
    });
}

function loadDefaults() {
    loadParameters();
    updateUiFromCustomParams();
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

function parseCustomParams(paramString) {
    const params = {};
    if (!paramString) return params;

    const parts = paramString.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    
    for (let i = 0; i < parts.length; i++) {
        let part = parts[i].trim().replace(/^['"]|['"]$/g, '');
        
        if (part.startsWith('-')) {
            const currentKey = part;
            const nextPart = parts[i + 1] ? parts[i + 1].trim().replace(/^['"]|['"]$/g, '') : null;
            
            if (nextPart && !nextPart.startsWith('-')) {
                params[currentKey] = nextPart;
                i++;
            } else {
                params[currentKey] = true;
            }
        } else {
            console.warn(`Ignoring unassociated value: ${part}`);
        }
    }
    return params;
}

function updateUiFromCustomParams() {
    const customParamsString = document.getElementById("customParams").value.trim();
    const customParams = parseCustomParams(customParamsString);
    const forceMkvElement = document.getElementById("mkv");
    let disableForceMkv = false; 
    let setForceMkvChecked = false;

    for (const flag of YTDLP_MKV_HIERARCHY) {
        const value = customParams[flag];
        if (value !== undefined) {
            disableForceMkv = true;
            if (String(value).toLowerCase() === 'mkv') {
                setForceMkvChecked = true;
                break;
            } else {
                setForceMkvChecked = false;
                break;
            }
        }
    }
    
    if (!disableForceMkv && customParams['--mkv'] === true) {
        disableForceMkv = true;
        setForceMkvChecked = true;
    }
    
    parameterConfig.forEach(config => {
        const element = document.getElementById(config.elementId);
        if (!element || config.elementId === "customParams") {
            return;
        }

        element.disabled = false;
        element.classList.remove('overridden');
        delete element.dataset.overridden;
        const storedValue = localStorage.getItem(config.storageKey);
        
        if (config.type === "checked") {
            element.checked = storedValue !== null ? storedValue === "true" : config.defaultValue;
        } else if (config.type === "value") {
            const isStoredValueValid = storedValue && storedValue.trim() !== "";
            element.value = isStoredValueValid ? storedValue.trim() : config.defaultValue;
        }
    });

    if (forceMkvElement && disableForceMkv) {
        forceMkvElement.checked = setForceMkvChecked; 
        forceMkvElement.disabled = true;
        forceMkvElement.classList.add('overridden');
        forceMkvElement.dataset.overridden = 'true';
    }

    for (const [fullFlag, value] of Object.entries(customParams)) {
        const canonicalKey = FLAG_TO_CANONICAL_MAP[fullFlag];
        
        if (canonicalKey) {
            const config = parameterConfig.find(c => c.storageKey === canonicalKey);
            const element = document.getElementById(config.elementId);

            if (element) {
                if (element.id === "mkv") continue; 

                if (config.type === "checked") {
                    element.checked = (value === true) || (String(value).toLowerCase() === 'true') || (String(value) === '1');
                } else if (config.type === "value") {
                    element.value = String(value);
                }
                
                element.dataset.overridden = 'true';
                element.disabled = true;
                element.classList.add('overridden');
            }
        }
    }
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

    updateUiFromCustomParams();
    saveParameters();

    const forceMkvIsOverridden = document.getElementById("mkv") && document.getElementById("mkv").dataset.overridden === 'true';
    const body = {
        youtubeID,
        quality: document.getElementById("quality").value,
        binary: document.getElementById("binary").value,
        params: {},
        callbacks: []
    };

    parameterConfig.forEach(config => {
        if (["binary", "downloadQuality", "refreshInterval"].includes(config.storageKey)) {
            return;
        }
        if (config.storageKey === "force_mkv" && forceMkvIsOverridden) {
            return;
        }
        const element = document.getElementById(config.elementId);
        if (!element) {
            return;
        }

        let value;
        if (config.type === "value") {
            value = element.value.trim();
        } else if (config.type === "checked") {
            value = element.checked;
        }

        if (value || (config.type === "checked" && value === true)) {
            body.params[config.storageKey] = value;
        }
    });

    const customParamsString = document.getElementById("customParams").value.trim();
    const customParams = parseCustomParams(customParamsString);

    for (const [fullFlag, value] of Object.entries(customParams)) {
        if (FLAG_TO_CANONICAL_MAP[fullFlag]) {
            continue;
        }
        body.params[fullFlag] = value;
    }

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
    if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`[LoadStatus Error ${resp.status}] Server responded with non-OK status. Response Body:`, errorText);
        return;
    }
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
