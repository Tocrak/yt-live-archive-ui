class WebUIController {

    TASK_STATUS_MAP = {
        1: "Done",
        2: "Error",
        4: "Warning",
        5: "Active",
        6: "Starting"
    };

    PARAMETER_CONFIG = [
        { key: "binary", elementId: "binary", defaultValue: "ytdlp", type: "value" },
        { key: "downloadQuality", elementId: "quality", defaultValue: "best", type: "value" },
        { key: "embed_thumbnail", elementId: "thumbnail", defaultValue: true, type: "checked" },
        { key: "wait_for_live", elementId: "wait", defaultValue: true, type: "checked" },
        { key: "force_mkv", elementId: "mkv", defaultValue: true, type: "checked", isOptional: true },
        { key: "use_cookies", elementId: "youtubeCookies", defaultValue: false, type: "checked" },
        { key: "output_filename", elementId: "output", defaultValue: "%(channel)s - %(title)s", type: "value" },
        { key: "retry_stream", elementId: "retryStream", defaultValue: "60", type: "value" },
        { key: "threads", elementId: "threads", defaultValue: "1", type: "value" },
        { key: "refreshInterval", elementId: "refreshInterval", defaultValue: "2", type: "value", isOptional: true },
        { key: "customParams", elementId: "customParams", defaultValue: "", type: "value", isOptional: true },
    ];

    FLAG_TO_CANONICAL_MAP = {
        '--output': 'output_filename',
        '-o': 'output_filename',
        '--wait-for-video': 'retry_stream',
        '--concurrent-fragments': 'threads',
        '--live-from-start': 'wait_for_live',
        '--embed-thumbnail': 'embed_thumbnail',
        '--retry-stream': 'retry_stream',
        '--threads': 'threads',
        '--wait': 'wait_for_live',
        '--thumbnail': 'embed_thumbnail',
    };

    MKV_HIERARCHY = ['--recode-video', '--remux-video', '--merge-output-format'];

    statusIntervalId = null;
    notifyTimeoutId = null;
    collapsedLogs = new Set(JSON.parse(localStorage.getItem('collapsedLogs') || '[]'));
    taskElements = new Map();
    elements = {};


    constructor() {
        this.cacheDOMElements([
            "startBtn", "updateYtdlpBtn", "youtubeID", "notice",
            "callbackRow", "callbackList", "taskList", "customParams",
            "mkv", "quality", "binary",
        ]);

        this.removeTaskHandler = this.removeTaskHandler.bind(this);

        document.addEventListener("DOMContentLoaded", () => this.init());
    }

    cacheDOMElements(ids) {
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
        this.PARAMETER_CONFIG.forEach(config => {
            if (!this.elements[config.elementId]) {
                this.elements[config.elementId] = document.getElementById(config.elementId);
            }
        });
    }

    getElement(id) {
        return this.elements[id];
    }

    init() {
        this.loadParameters(); 
        this.updateUiFromCustomParams(); 
        this.setupListeners();
        this.loadCallbacks();
        this.loadStatus();
        this.startStatusInterval();
        window.webUIController = this;
    }

    setupListeners() {
        const startBtn = this.getElement("startBtn");
        if (startBtn) {
            startBtn.onclick = () => this.startDownload();
        }

        const updateBtn = this.getElement("updateYtdlpBtn");
        if (updateBtn) {
            updateBtn.onclick = () => this.updateYtdlp();
        }

        const youtubeIDInput = this.getElement("youtubeID");
        if (youtubeIDInput) {
            youtubeIDInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.startDownload();
                }
            });
        }

        const taskList = this.getElement("taskList");
        if (taskList) {
            taskList.addEventListener('click', (event) => {
                const target = event.target;
                if (target.classList.contains('remove-btn')) {
                    this.removeTaskHandler(target);
                } else if (target.classList.contains('log-toggle')) {
                    this.toggleLog(target);
                }
            });
        }

        this.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);
            if (!element) {
                return;
            }

            if (config.elementId === "refreshInterval") {
                element.addEventListener("change", () => {
                    this.saveParameters();
                    this.startStatusInterval();
                });
            } else if (config.elementId === "customParams") {
                element.addEventListener("input", () => {
                    this.saveParameters();
                    this.updateUiFromCustomParams();
                });
            } else {
                element.addEventListener("change", () => this.saveParameters());
            }
        });
    }

    loadParameters() {
        const customParamsElement = this.getElement("customParams");
        const customParamsStoredValue = localStorage.getItem("customParams") || "";
        if (customParamsElement) {
             customParamsElement.value = customParamsStoredValue;
        }

        this.PARAMETER_CONFIG.forEach(config => {
            if (config.key === "customParams") {
                return;
            }

            const element = this.getElement(config.elementId);
            if (!element && config.isOptional) {
                return;
            }

            if (!element) {
                console.warn(`Element with ID '${config.elementId}' not found.`);
                return;
            }
            
            this.loadParameterValue(config, element);
        });
    }

    loadParameterValue(config, element) {
        const storedValue = localStorage.getItem(config.key);
        if (config.type === "checked") {
            const defaultCheck = config.defaultValue;
            element.checked = storedValue !== null
                ? storedValue === "true"
                : defaultCheck;
        } else if (config.type === "value") {
            element.value = storedValue && storedValue.trim() !== ""
                ? storedValue.trim()
                : config.defaultValue;
        }
    }

    saveParameters() {
        this.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);
            if (!element) {
                return;
            }

            const isOverridden = element.dataset.overridden === 'true';
            if (config.key === "customParams" || !isOverridden) {
                 let valueToSave;
                 if (config.type === "checked") {
                     valueToSave = element.checked.toString();
                 } else if (config.type === "value") {
                     valueToSave = element.value.trim();
                 }

                 localStorage.setItem(config.key, valueToSave);
            }
        });
    }

    parseCustomParams(paramString) {
        const params = {};
        if (!paramString) {
            return params;
        }

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

    updateUiFromCustomParams() {
        const customParamsString = this.getElement("customParams").value.trim();
        const customParams = this.parseCustomParams(customParamsString);
        const forceMkvElement = this.getElement("mkv");
        
        this.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);
            if (!element || config.elementId === "customParams") {
                return;
            }
            
            element.disabled = false;
            element.classList.remove('overridden');
            delete element.dataset.overridden;
            
            this.loadParameterValue(config, element);
        });

        let disableForceMkv = false;
        let setForceMkvChecked = false;

        for (const flag of this.MKV_HIERARCHY) {
            const value = customParams[flag];
            if (value !== undefined) {
                disableForceMkv = true;
                setForceMkvChecked = (String(value).toLowerCase() === 'mkv');
                break;
            }
        }
        if (!disableForceMkv && customParams['--mkv'] === true) {
            disableForceMkv = true;
            setForceMkvChecked = true;
        }

        if (forceMkvElement && disableForceMkv) {
            forceMkvElement.checked = setForceMkvChecked;
            forceMkvElement.disabled = true;
            forceMkvElement.classList.add('overridden');
            forceMkvElement.dataset.overridden = 'true';
        }

        for (const [fullFlag, value] of Object.entries(customParams)) {
            const canonicalKey = this.FLAG_TO_CANONICAL_MAP[fullFlag];

            if (canonicalKey) {
                const config = this.PARAMETER_CONFIG.find(c => c.key === canonicalKey);
                const element = this.getElement(config.elementId);

                if (element && element.id !== "mkv") {
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

    extractVideoId(input) {
        input = input.trim();
        try {
            const url = new URL(input);
            if (url.hostname.includes("youtube") && url.searchParams.has("v")) {
                return url.searchParams.get("v");
            }
            if (url.hostname.includes("youtu.be")) {
                return url.pathname.substring(1);
            }
            if (url.hostname.includes("holodex.net")) {
                return url.pathname.split("/").pop();
            }
        } catch (e) {
        }
        return input;
    }

    async startDownload() {
        const youtubeIDInput = this.getElement("youtubeID");
        const youtubeID = this.extractVideoId(youtubeIDInput.value.trim());

        if (!youtubeID) {
            this.notify("Enter a YouTube ID or URL", 'error');
            return;
        }
        youtubeIDInput.value = "";

        this.updateUiFromCustomParams();
        this.saveParameters();

        const body = {
            youtubeID,
            quality: this.getElement("quality").value,
            binary: this.getElement("binary").value,
            params: {},
            callbacks: []
        };

        const params = {};
        const customParamsString = this.getElement("customParams").value.trim();
        const customParams = this.parseCustomParams(customParamsString);
        
        this.PARAMETER_CONFIG.forEach(config => {
            if (["binary", "downloadQuality", "refreshInterval", "customParams"].includes(config.key)) {
                return;
            }

            const element = this.getElement(config.elementId);
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
                params[config.key] = value;
            }
        });

        for (const [fullFlag, value] of Object.entries(customParams)) {
            const canonicalKey = this.FLAG_TO_CANONICAL_MAP[fullFlag];
            
            if (!canonicalKey) {
                 params[fullFlag] = value;
            }
        }

        body.params = params;

        this.getElement("callbackList").querySelectorAll("input[type=checkbox]:checked")
            .forEach(cb => body.callbacks.push(cb.value));

        try {
            const resp = await fetch("/record", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await resp.json();
            this.notify("Task started: " + data.id);
        } catch (error) {
            console.error("Error starting download:", error);
            this.notify("Failed to start task.", 'error');
        }
    }

    async updateYtdlp() {
        this.notify("Starting yt-dlp update...", 'warning');

        try {
            const resp = await fetch("/update-ytdlp", { method: "POST" });
            const data = await resp.json();

            if (resp.ok) {
                this.notify(data.message);
            } else {
                const errorMessage = data.detail || "An unknown error occurred.";
                this.notify(errorMessage, 'error');
            }
        } catch (error) {
            console.error("Error updating yt-dlp:", error);
            this.notify("Failed to connect to the server for update.", 'error');
        }

        this.loadStatus();
    }

    async loadCallbacks() {
        const row = this.getElement("callbackRow");
        const list = this.getElement("callbackList");
        if (!row || !list) {
            return;
        }

        try {
            const resp = await fetch("/callbacks");
            if (!resp.ok) {
                return;
            }

            const data = await resp.json();
            row.style.display = "block";
            list.innerHTML = '';

            for (const cb of data) {
                const div = document.createElement("div");
                div.innerHTML = `<label><input type="checkbox" value="${cb}"> ${cb}</label>`;
                list.appendChild(div);
            }
        } catch (error) {
            console.error("Error loading callbacks:", error);
        }
    }

    startStatusInterval() {
        if (this.statusIntervalId) {
            clearInterval(this.statusIntervalId);
        }
        const refreshIntervalEl = this.getElement("refreshInterval");
        const intervalSeconds = parseInt(refreshIntervalEl ? refreshIntervalEl.value : "2") || 2;
        const intervalMs = intervalSeconds * 1000;
        this.statusIntervalId = setInterval(() => this.loadStatus(), intervalMs);
    }

    async loadStatus() {
        const scrollY = window.scrollY;
        const container = this.getElement("taskList");
        if (!container) {
            return;
        }

        try {
            const resp = await fetch("/status");
            if (!resp.ok) {
                const errorText = await resp.text();
                console.error(`[LoadStatus Error ${resp.status}] Server responded with non-OK status. Response Body:`, errorText);
                return;
            }
            const data = await resp.json();

            const incomingTaskIds = new Set(Object.keys(data));
            const sortedUids = Array.from(incomingTaskIds).sort();

            this.removeOldTasks(incomingTaskIds);
            this.updateOrCreateTasks(sortedUids, data, container);
        } catch (error) {
            console.error("Error fetching status:", error);
        }

        window.scrollTo(0, scrollY);
    }

    _cleanupTask(uid, taskElement) {
        const removeBtn = taskElement.querySelector(".remove-btn");
        const existingTimeoutId = removeBtn ? removeBtn.dataset.confirmTimeoutId : null;
        if (existingTimeoutId) {
            clearTimeout(existingTimeoutId);
        }

        taskElement.remove();
        this.taskElements.delete(uid);
        this.collapsedLogs.delete(`log-${uid}`);
        
        if (taskElement.dataset.id) {
            localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(this.collapsedLogs)));
        }
    }

    removeOldTasks(incomingTaskIds) {
        const tasksToRemove = new Map();
        this.taskElements.forEach((element, uid) => {
            if (!incomingTaskIds.has(uid)) {
                tasksToRemove.set(uid, element);
            }
        });

        tasksToRemove.forEach((taskElement, uid) => {
            this._cleanupTask(uid, taskElement);
        });
    }

    updateOrCreateTasks(sortedUids, data, container) {
        const fragment = document.createDocumentFragment();

        for (const uid of sortedUids) {
            const rec = data[uid];
            const logId = `log-${uid}`;
            const statusText = this.TASK_STATUS_MAP[rec.status] || rec.status;
            const outputText = (rec.output || "").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const currentLogText = `<br>${outputText.replace(/\n/g, "<br>")}`;
            
            let isCollapsed = this.collapsedLogs.has(logId);
            let taskDiv = this.taskElements.get(uid);

            if (!taskDiv) {
                taskDiv = document.createElement("div");
                taskDiv.className = "task";
                taskDiv.dataset.id = uid;

                taskDiv.innerHTML = `
                    <div class="task-header">
                        <strong data-id-display>${uid}</strong>
                        <span class="task-status ${statusText.toLowerCase()}">${statusText}</span>
                        <button class="remove-btn" data-id="${uid}">Remove</button>
                    </div>
                    <div class="log-toggle" data-target="${logId}">
                        ${isCollapsed ? '▶ Logs' : '▼ Logs'}
                    </div>
                    <div id="${logId}" class="log ${isCollapsed ? '' : 'expanded'}" data-auto-scroll="${!isCollapsed}">${currentLogText}</div>
                `;

                this.taskElements.set(uid, taskDiv);
                fragment.appendChild(taskDiv);

                this.ensureScrollListener(taskDiv);
            } else {
                taskDiv.querySelector('.task-status').textContent = statusText;
                taskDiv.querySelector('.task-status').className = `task-status ${statusText.toLowerCase()}`;

                const logDiv = taskDiv.querySelector(`#${logId}`);
                const logToggle = taskDiv.querySelector('.log-toggle');

                if (logDiv.innerHTML !== currentLogText) {
                    logDiv.innerHTML = currentLogText;
                }

                const shouldBeExpanded = !isCollapsed;
                const isCurrentlyExpanded = logDiv.classList.contains('expanded');

                if (shouldBeExpanded !== isCurrentlyExpanded) {
                    logDiv.classList.toggle('expanded', shouldBeExpanded);
                    logToggle.textContent = shouldBeExpanded ? "▼ Logs" : "▶ Logs";
                    logDiv.dataset.autoScroll = shouldBeExpanded ? "true" : logDiv.dataset.autoScroll;
                }
            }

            const logDiv = taskDiv.querySelector(`#${logId}`);
            if (!isCollapsed && logDiv && logDiv.dataset.autoScroll === "true") {
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        }

        container.appendChild(fragment);
    }

    ensureScrollListener(taskElement) {
        const logDiv = taskElement.querySelector(".log");
        if (!logDiv || logDiv.dataset.scrollListener === 'true') {
            return;
        }

        logDiv.addEventListener('scroll', () => {
            const scrollTolerance = 5;
            const isScrolledToBottom = (logDiv.scrollHeight - logDiv.scrollTop - logDiv.clientHeight) < scrollTolerance;
            logDiv.dataset.autoScroll = isScrolledToBottom ? "true" : "false";
        });
        logDiv.dataset.scrollListener = 'true';
    }

    async removeTaskHandler(btn) {
        const taskId = btn.dataset.id;

        if (btn.classList.contains('confirm-state')) {
            const existingTimeoutId = btn.dataset.confirmTimeoutId;
            if (existingTimeoutId) {
                clearTimeout(existingTimeoutId);
                delete btn.dataset.confirmTimeoutId;
            }

            const taskElement = btn.closest(".task");

            try {
                const resp = await fetch("/status", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: taskId })
                });

                if (resp.ok) {
                    this._cleanupTask(taskId, taskElement);
                    this.notify(`Task deleted: ${taskId}`);
                } else {
                    console.error(`Failed to delete task ${taskId}. Status: ${resp.status}`);
                    this.notify(`Error deleting task ${taskId}. Status: ${resp.status}`, 'error');
                    btn.classList.remove('confirm-state');
                    btn.textContent = 'Remove';
                }
            } catch (error) {
                console.error("Fetch error during task deletion:", error);
                this.notify(`Network error deleting task ${taskId}.`, 'error');
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
    }

    toggleLog(tgl) {
        const log = document.getElementById(tgl.dataset.target);
        if (!log) {
            return;
        }

        const logId = log.id;
        const isOpen = log.classList.contains("expanded");

        if (isOpen) {
            log.classList.remove("expanded");
            this.collapsedLogs.add(logId);
            tgl.textContent = "▶ Logs";
        } else {
            log.classList.add("expanded");
            this.collapsedLogs.delete(logId);
            tgl.textContent = "▼ Logs";

            log.scrollTop = log.scrollHeight;
            log.dataset.autoScroll = "true";
        }
        localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(this.collapsedLogs)));

        this.ensureScrollListener(log.closest(".task"));
    }

    notify(msg, type = 'success') {
        const n = this.getElement("notice");
        if (!n) {
            return;
        }

        if (this.notifyTimeoutId) {
            clearTimeout(this.notifyTimeoutId);
        }

        n.textContent = msg;
        n.className = "notice";
        if (type === 'error') {
            n.classList.add("error");
        } else if (type === 'warning') {
            n.classList.add("warning")
        }
        n.style.display = "block";

        this.notifyTimeoutId = setTimeout(() => {
            n.style.display = "none";
            this.notifyTimeoutId = null;
        }, 3000);
    }
}

window.webUIController = new WebUIController();
