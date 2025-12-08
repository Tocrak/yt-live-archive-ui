const TaskStatus = {
    DONE: 1,
    ERROR: 2,
    WARNING: 4,
    ACTIVE: 5,
    STARTING: 6,
};

const AppConfig = {
    // Regular expression for splitting command line parameters
    CUSTOM_PARAMS_REGEX: /(?:[^\s"']+|"[^"]*"|'[^']*')+/g,

    // Mapping for task status codes to human-readable text
    TASK_STATUS_MAP: {
        [TaskStatus.DONE]: "Done",
        [TaskStatus.ERROR]: "Error",
        [TaskStatus.WARNING]: "Warning",
        [TaskStatus.ACTIVE]: "Active",
        [TaskStatus.STARTING]: "Starting",
    },

    // Configuration for UI parameters and their corresponding DOM elements/storage keys
    PARAMETER_CONFIG: [
        { key: "binary", elementId: "binary", defaultValue: "ytdlp", type: "value", isControl: true },
        { key: "downloadQuality", elementId: "quality", defaultValue: "best", type: "value", isControl: true },
        { key: "embed_metadata", elementId: "metadata", defaultValue: true, type: "checked" },
        { key: "embed_thumbnail", elementId: "thumbnail", defaultValue: true, type: "checked" },
        { key: "wait_for_live", elementId: "wait", defaultValue: true, type: "checked" },
        { key: "force_mkv", elementId: "mkv", defaultValue: true, type: "checked", isOptional: true },
        { key: "use_cookies", elementId: "youtubeCookies", defaultValue: false, type: "checked" },
        { key: "output_filename", elementId: "output", defaultValue: "%(channel)s - %(title)s", type: "value" },
        { key: "retry_stream", elementId: "retryStream", defaultValue: "60", type: "value" },
        { key: "threads", elementId: "threads", defaultValue: "1", type: "value" },
        { key: "refreshInterval", elementId: "refreshInterval", defaultValue: "2", type: "value", isOptional: true, isControl: true },
        { key: "customParams", elementId: "customParams", defaultValue: "", type: "value", isOptional: true, isControl: true },
    ],

    // Mapping of youtube-dlp flags to internal parameter keys
    YTDLP_FLAG_MAP: {
        '--output': 'output_filename',
        '-o': 'output_filename',
        '--wait-for-video': 'retry_stream',
        '--concurrent-fragments': 'threads',
        '--live-from-start': 'wait_for_live',
        '--embed-metadata': 'embed_metadata',
        '--embed-thumbnail': 'embed_thumbnail',
    },

    // Mapping of ytarchive flags to internal parameter keys
    YTARCHIVE_FLAG_MAP: {
        '--output': 'output_filename',
        '-o': 'output_filename',
        '--retry-stream': 'retry_stream',
        '--threads': 'threads',
        '--wait': 'wait_for_live',
        '--add-metadata': 'embed_metadata',
        '--thumbnail': 'embed_thumbnail',
    },

    // Flags related to MKV merging for yt-dlp
    MKV_HIERARCHY: ['--recode-video', '--remux-video', '--merge-output-format'],

    // List of element IDs to cache at startup
    ELEMENT_IDS: [
        "startBtn", "updateYtarchiveBtn", "updateYtdlpBtn", "youtubeID", "notice",
        "callbackRow", "callbackList", "taskList", "customParams", "mkv", "quality",
        "binary", "parametersToggle", "parametersContent", "buttonGroup",
        "updateControlsContainer",
    ],

    get ALL_ELEMENT_IDS() {
        const parameterIds = this.PARAMETER_CONFIG.map(config => config.elementId);
        return Array.from(new Set([...this.ELEMENT_IDS, ...parameterIds]));
    },
};

class DOMHandler {
    constructor() {
        this.elements = {};
        this.cacheDOMElements(AppConfig.ALL_ELEMENT_IDS);
    }

    removeElement(element) {
        if (element && element.remove) {
            element.remove();
        }
    }

    setLogScroll(logDiv, toBottom) {
        if (toBottom) {
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    }

    cacheDOMElements(ids) {
        ids.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements[id] = element;
            } else {
                console.warn(`Element with ID '${id}' not found.`);
            }
        });
    }

    getElement(id) {
        return this.elements[id];
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

    toggleParameters(newState) {
        const toggle = this.getElement("parametersToggle");
        const content = this.getElement("parametersContent");
        const updateContainer = this.getElement("updateControlsContainer");

        if (!toggle || !content) {
            return;
        }

        const isCurrentlyExpanded = content.classList.contains("expanded");
        const finalState = newState !== undefined ? newState : !isCurrentlyExpanded;

        toggle.classList.toggle("expanded", finalState);
        content.classList.toggle("expanded", finalState);
        updateContainer.classList.toggle("collapsed", !finalState);

        localStorage.setItem("parametersExpanded", finalState.toString());
    }

    async loadCallbacks(taskList) {
        const row = this.getElement("callbackRow");
        const list = this.getElement("callbackList");
        if (!row || !list) {
            return;
        }

        try {
            const resp = await fetch("/callbacks");
            if (!resp.ok) {
                console.error(`Error loading callbacks: Server returned status ${resp.status}`);
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

    updateOrCreateTasks(sortedUids, data, taskElements, collapsedLogs) {
        const container = this.getElement("taskList");
        const fragment = document.createDocumentFragment();

        for (const uid of sortedUids) {
            const rec = data[uid];
            const logId = `log-${uid}`;
            const statusText = AppConfig.TASK_STATUS_MAP[rec.status] || rec.status;
            const outputText = (rec.output || "").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const currentLogText = `<br>${outputText.replace(/\n/g, "<br>")}`;

            let isCollapsed = collapsedLogs.has(logId);
            let taskDiv = taskElements.get(uid);

            if (!taskDiv || !taskDiv.querySelector) {
                taskDiv = document.createElement("div");
                taskDiv.className = "task";
                taskDiv.dataset.id = uid;

                const idDisplay = document.createElement("strong");
                idDisplay.textContent = uid;
                idDisplay.dataset.idDisplay = true;

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

                taskElements.set(uid, taskDiv);
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
                    if (shouldBeExpanded) {
                        logDiv.dataset.autoScroll = "true";
                    }
                }
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

    toggleLogState(tgl, collapsedLogs) {
        const log = document.getElementById(tgl.dataset.target);
        if (!log) {
            return;
        }

        const logId = log.id;
        const isOpen = log.classList.contains("expanded");

        if (isOpen) {
            log.classList.remove("expanded");
            collapsedLogs.add(logId);
            tgl.textContent = "▶ Logs";
            log.dataset.autoScroll = "false";
        } else {
            log.classList.add("expanded");
            collapsedLogs.delete(logId);
            tgl.textContent = "▼ Logs";
            this.setLogScroll(log, true);
            log.dataset.autoScroll = "true";
        }

        this.ensureScrollListener(log.closest(".task"));
    }
}

class WebUIController {
    statusIntervalId = null;
    collapsedLogs = new Set(JSON.parse(localStorage.getItem('collapsedLogs') || '[]'));
    taskElements = new Map();
    dom = new DOMHandler();

    constructor() {
        this.removeTaskHandler = this.removeTaskHandler.bind(this);
        this.toggleLog = this.toggleLog.bind(this);
        this.startDownload = this.startDownload.bind(this);
        this.updateYtarchive = this.updateYtarchive.bind(this);
        this.updateYtdlp = this.updateYtdlp.bind(this);

        this.paramConfigMap = new Map();

        document.addEventListener("DOMContentLoaded", () => this.init());
    }

    getElement(id) {
        return this.dom.getElement(id);
    }

    init() {
        this.createParamConfigMap();
        this.loadParameters();
        this.loadParametersCollapseState();
        this.updateUiFromCustomParams();
        this.setupListeners();
        this.dom.loadCallbacks();
        this.loadStatus();
        this.startStatusInterval();
    }

    createParamConfigMap() {
        AppConfig.PARAMETER_CONFIG.forEach(config => {
            this.paramConfigMap.set(config.key, config);
        });
    }

    setupListeners() {
        const addListener = (id, event, handler) => {
            const el = this.getElement(id);
            if (el) el.addEventListener(event, handler);
        };

        addListener("startBtn", "click", this.startDownload);
        addListener("updateYtarchiveBtn", "click", this.updateYtarchive);
        addListener("updateYtdlpBtn", "click", this.updateYtdlp);
        addListener("parametersToggle", "click", () => this.dom.toggleParameters());

        addListener("youtubeID", "keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.startDownload();
            }
        });

        addListener("taskList", 'click', (event) => {
            const target = event.target;
            if (target.classList.contains('remove-btn')) {
                this.removeTaskHandler(target);
            } else if (target.classList.contains('log-toggle')) {
                this.toggleLog(target);
            }
        });

        AppConfig.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);
            if (!element) {
                return;
            }

            if (config.elementId === "refreshInterval") {
                addListener(config.elementId, "change", () => {
                    this.saveParameters();
                    this.startStatusInterval();
                });
            } else if (config.elementId === "customParams" || config.elementId === "binary") {
                addListener(config.elementId, (config.elementId === "customParams" ? "input" : "change"), () => {
                    this.saveParameters();
                    this.updateUiFromCustomParams();
                });
            } else {
                addListener(config.elementId, "change", () => this.saveParameters());
            }
        });
    }

    loadParametersCollapseState() {
        const isExpanded = localStorage.getItem("parametersExpanded") !== "false";
        this.dom.toggleParameters(isExpanded);
    }

    _loadParameterValue(config, element) {
        const storedValue = localStorage.getItem(config.key);
        if (config.type === "checked") {
            const defaultCheck = config.defaultValue;
            element.checked = storedValue !== null
                ? storedValue === "true"
                : defaultCheck;
        } else if (config.type === "value") {
            const isStored = storedValue !== null && storedValue.trim() !== "";
            element.value = isStored ? storedValue.trim() : config.defaultValue;
        }
    }

    loadParameters() {
        AppConfig.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);

            if (!element) {
                if (!config.isOptional) {
                    console.warn(`Element with ID '${config.elementId}' not found.`);
                }
                return;
            }

            this._loadParameterValue(config, element);
        });
    }

    saveParameters() {
        AppConfig.PARAMETER_CONFIG.forEach(config => {
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
        paramString = paramString ? paramString.trim() : "";

        const params = {};
        if (!paramString) {
            return params;
        }

        const parts = paramString.match(AppConfig.CUSTOM_PARAMS_REGEX) || [];
        for (let i = 0; i < parts.length; i++) {
            let part = parts[i].trim();
            if (part.startsWith('-')) {
                const currentKey = part;
                if (parts[i + 1] && !parts[i + 1].trim().startsWith('-')) {
                    const nextPart = parts[i + 1].trim();
                    params[currentKey] = nextPart.replace(/^['"]|['"]$/g, '');
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
        const binary = this.getElement("binary").value;
        const activeFlagMap = binary === "ytarchive" ? AppConfig.YTARCHIVE_FLAG_MAP : AppConfig.YTDLP_FLAG_MAP;

        AppConfig.PARAMETER_CONFIG.forEach(config => {
            const element = this.getElement(config.elementId);
            if (!element || config.elementId === "customParams") {
                return;
            }

            element.disabled = false;
            element.classList.remove('overridden');
            delete element.dataset.overridden;

            this._loadParameterValue(config, element);
        });

        let disableForceMkv = false;
        let setForceMkvChecked = false;
        const mkvOverrideKeys = binary === "ytdlp" ? AppConfig.MKV_HIERARCHY : ['--mkv'];

        for (const flag of mkvOverrideKeys) {
            const value = customParams[flag];
            if (value !== undefined) {
                disableForceMkv = true;
                setForceMkvChecked = (String(value).toLowerCase() === 'mkv' || value === true);
                break;
            }
        }

        if (forceMkvElement && disableForceMkv) {
            forceMkvElement.checked = setForceMkvChecked;
            forceMkvElement.disabled = true;
            forceMkvElement.classList.add('overridden');
            forceMkvElement.dataset.overridden = 'true';
        }

        for (const [fullFlag, value] of Object.entries(customParams)) {
            const canonicalKey = activeFlagMap[fullFlag];

            if (canonicalKey) {
                const config = this.paramConfigMap.get(canonicalKey);
                const element = this.getElement(config.elementId);

                if (!config || !element || element.id === "mkv") continue;

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
        } catch (e) { /* Not a valid URL, treat as ID */ }
        return input;
    }

    _getTaskElementStatus(youtubeID) {
        const taskElement = this.taskElements.get(youtubeID);
        if (!taskElement) {
            return null;
        }
        const statusElement = taskElement.querySelector('.task-status');
        return statusElement ? statusElement.textContent : 'Unknown';
    }

    async startDownload() {
        const youtubeIDInput = this.getElement("youtubeID");
        const youtubeID = this.extractVideoId(youtubeIDInput.value.trim());
        if (!youtubeID) {
            this.dom.notify("Enter a YouTube ID or URL", 'error');
            return;
        }

        const taskElement = this.taskElements.get(youtubeID);
        if (taskElement) {
            const statusText = this._getTaskElementStatus(youtubeID);
            if (['Active', 'Starting'].includes(statusText)) {
                this.dom.notify(`A task for video ID ${youtubeID} is already running (Status: ${statusText}).`, 'error');
                return;
            }
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
        const activeFlagMap = body.binary === "ytarchive" ? AppConfig.YTARCHIVE_FLAG_MAP : AppConfig.YTDLP_FLAG_MAP;
        const customMkvKeys = body.binary === "ytdlp" ? AppConfig.MKV_HIERARCHY : ['--mkv'];
        const customMergeFlagIsPresent = Object.keys(customParams).some(flag => customMkvKeys.includes(flag));

        AppConfig.PARAMETER_CONFIG
            .filter(config => !config.isControl)
            .forEach(config => {
                if (config.key === 'force_mkv' && customMergeFlagIsPresent) {
                    return;
                }

                const element = this.getElement(config.elementId);
                if (!element) {
                    return;
                }

                let value = config.type === "value" ? element.value.trim() : element.checked;
                if (value || (config.type === "checked" && value === true)) {
                    params[config.key] = value;
                }
            });

        for (const [fullFlag, value] of Object.entries(customParams)) {
            const canonicalKey = activeFlagMap[fullFlag];
            if (!customMergeFlagIsPresent && customMkvKeys.includes(fullFlag)) {
                continue;
            }

            const key = canonicalKey || fullFlag;
            params[key] = value;
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
            youtubeIDInput.value = "";
            if (resp.ok) {
                this.dom.notify("Task started: " + data.id);
                await this.loadStatus();
            } else {
                const detail = data.detail || `Server error (Status: ${resp.status}).`;
                this.dom.notify(detail, 'error');
            }
        } catch (error) {
            console.error("Error starting download (Network or JSON Parse):", error);
            this.dom.notify("Failed to start task. (Network Error)", 'error');
        }
    }

    async updateYtdlp() {
        await this._sendUpdateCommand("/update-ytdlp", "yt-dlp");
    }

    async updateYtarchive() {
        await this._sendUpdateCommand("/update-ytarchive", "ytarchive");
    }

    async _sendUpdateCommand(url, name) {
        this.dom.notify(`Starting ${name} update...`, 'warning');
        try {
            const resp = await fetch(url, { method: "POST" });
            const data = await resp.json();

            if (resp.ok) {
                this.dom.notify(data.message);
            } else {
                const errorMessage = data.detail || "An unknown error occurred.";
                this.dom.notify(errorMessage, 'error');
            }
        } catch (error) {
            console.error(`Error updating ${name}:`, error);
            this.dom.notify(`Failed to connect to the server for ${name} update.`, 'error');
        }
        this.loadStatus();
    }

    getRefreshIntervalMs() {
        const refreshIntervalEl = this.getElement("refreshInterval");
        const intervalSeconds = parseInt(refreshIntervalEl ? refreshIntervalEl.value : "2") || 2;
        return intervalSeconds * 1000;
    }

    startStatusInterval() {
        if (this.statusIntervalId) {
            clearInterval(this.statusIntervalId);
        }
        this.statusIntervalId = setInterval(() => this.loadStatus(), this.getRefreshIntervalMs());
    }

    async loadStatus() {
        try {
            const resp = await fetch("/status");
            if (!resp.ok) {
                const errorText = await resp.text();
                console.error(`[LoadStatus Error ${resp.status}] Server responded with non-OK status. Response Body:`, errorText);
                return;
            }
            const data = await resp.json();
            const incomingTaskIds = new Set(Object.keys(data));
            const sortedUids = Array.from(incomingTaskIds);

            this._removeOldTasks(incomingTaskIds);
            this.dom.updateOrCreateTasks(sortedUids, data, this.taskElements, this.collapsedLogs);

            this.taskElements.forEach(taskDiv => {
                const logDiv = taskDiv.querySelector('.log');
                if (logDiv && logDiv.classList.contains('expanded') && logDiv.dataset.autoScroll === "true") {
                    this.dom.setLogScroll(logDiv, true);
                }
            });
        } catch (error) {
            console.error("Error fetching status:", error);
        }
    }

    _cleanupTask(uid, taskElement) {
        const removeBtn = taskElement.querySelector(".remove-btn");
        const existingTimeoutId = removeBtn ? removeBtn.dataset.confirmTimeoutId : null;
        if (existingTimeoutId) {
            clearTimeout(existingTimeoutId);
        }

        this.dom.removeElement(taskElement);
        this.taskElements.delete(uid);
        this.collapsedLogs.delete(`log-${uid}`);

        if (taskElement.dataset.id) {
            localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(this.collapsedLogs)));
        }
    }

    _removeOldTasks(incomingTaskIds) {
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

    async removeTaskHandler(btn) {
        const taskId = btn.dataset.id;
        const taskElement = btn.closest(".task");

        if (btn.classList.contains('confirm-state')) {
            const existingTimeoutId = btn.dataset.confirmTimeoutId;
            if (existingTimeoutId) {
                clearTimeout(existingTimeoutId);
                delete btn.dataset.confirmTimeoutId;
            }

            try {
                const resp = await fetch("/status", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: taskId })
                });

                if (resp.ok) {
                    this._cleanupTask(taskId, taskElement);
                    this.dom.notify(`Task deleted: ${taskId}`);
                } else {
                    console.error(`Failed to delete task ${taskId}. Status: ${resp.status}`);
                    this.dom.notify(`Error deleting task ${taskId}. Status: ${resp.status}`, 'error');
                    btn.classList.remove('confirm-state');
                    btn.textContent = 'Remove';
                }
            } catch (error) {
                console.error("Fetch error during task deletion:", error);
                this.dom.notify(`Network error deleting task ${taskId}.`, 'error');
                btn.classList.remove('confirm-state');
                btn.textContent = 'Remove';
            }
        } else {
            const existingTimeoutId = btn.dataset.confirmTimeoutId;
            if (existingTimeoutId) clearTimeout(existingTimeoutId);

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
        this.dom.toggleLogState(tgl, this.collapsedLogs);
        localStorage.setItem('collapsedLogs', JSON.stringify(Array.from(this.collapsedLogs)));
    }
}

window.webUIController = new WebUIController();
