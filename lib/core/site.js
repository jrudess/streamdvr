"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const child_process_1 = require("child_process");
const colors = require("colors");
const yaml = require("js-yaml");
async function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
class Site {
    constructor(siteName, dvr, tui) {
        this.siteName = siteName;
        this.dvr = dvr;
        this.tui = tui;
        this.padName = siteName.padEnd(9, " ");
        this.listName = siteName.toLowerCase();
        this.cfgFile = dvr.configdir + this.listName + ".yml";
        this.updateName = dvr.configdir + this.listName + "_updates.yml";
        this.config = yaml.safeLoad(fs.readFileSync(this.cfgFile, "utf8"));
        this.tempList = []; // temp record list (session only)
        this.streamerList = new Map(); // Refer to addStreamer() for JSON entries
        this.redrawList = false;
        this.paused = false;
        if (dvr.config.tui.enable) {
            tui.addSite(this);
        }
        this.infoMsg(this.config.streamers.length + " streamer(s) in config");
        if (typeof this.config.siteUrl === "undefined") {
            this.errMsg(this.cfgFile + " is missing siteUrl");
        }
    }
    getStreamerList() {
        return Array.from(this.streamerList.values());
    }
    getFileName(nm) {
        let filename = this.dvr.config.recording.fileNameFormat ? this.dvr.config.recording.fileNameFormat : "%n_%s_%d";
        filename = filename.replace(/%s/gi, this.listName);
        filename = filename.replace(/%n/gi, nm);
        filename = filename.replace(/%d/gi, this.dvr.getDateTime());
        return filename;
    }
    checkFileSize() {
        const maxSize = this.dvr.config.recording.maxSize;
        for (const streamer of this.streamerList.values()) {
            if (streamer.capture === null || streamer.postProcess) {
                continue;
            }
            const stat = fs.statSync(this.dvr.config.recording.captureDirectory + "/" + streamer.filename);
            const sizeMB = Math.round(stat.size / 1048576);
            this.dbgMsg(colors.file(streamer.filename) + ", size=" + sizeMB + "MB, maxSize=" + maxSize + "MB");
            if (sizeMB === streamer.filesize) {
                this.infoMsg(colors.name(streamer.nm) + " recording appears to be stuck (counter=" + streamer.stuckcounter + "), file size is not increasing: " + sizeMB + "MB");
                streamer.stuckcounter++;
            }
            else {
                streamer.filesize = sizeMB;
            }
            if (streamer.stuckcounter >= 2) {
                this.infoMsg(colors.name(streamer.nm) + " terminating stuck recording");
                this.haltCapture(streamer.uid);
                streamer.stuckcounter = 0;
                this.redrawList = true;
            }
            else if (maxSize !== 0 && sizeMB >= maxSize) {
                this.infoMsg(colors.name(streamer.nm) + " recording has exceeded file size limit (size=" + sizeMB + " > maxSize=" + maxSize + ")");
                this.haltCapture(streamer.uid);
                this.redrawList = true;
            }
        }
    }
    connect() {
        // optional virtual method
    }
    disconnect() {
        // optional virtual method
    }
    getCaptureArguments(url, filename, options) {
        let args = [
            "-o",
            this.dvr.config.recording.captureDirectory + "/" + filename + ".ts",
            "-s",
            url,
        ];
        if (this.dvr.config.proxy.enable) {
            args.push("-P");
            args.push(this.dvr.config.proxy.server);
        }
        if (this.dvr.config.debug.recorder) {
            args.push("-d");
        }
        if (this.config.username) {
            args.push("--" + this.listName + "-username=" + this.config.username);
        }
        if (this.config.password) {
            args.push("--" + this.listName + "-password=" + this.config.password);
        }
        if (options && options.params) {
            args = args.concat(options.params);
        }
        return args;
    }
    async processUpdates(options) {
        const stats = fs.statSync(this.updateName);
        if (!stats.isFile()) {
            this.dbgMsg(this.updateName + " does not exist");
            return;
        }
        const updates = yaml.safeLoad(fs.readFileSync(this.updateName, "utf8"));
        let list = [];
        if (options.add) {
            if (!updates.include) {
                updates.include = [];
            }
            else if (updates.include.length > 0) {
                this.infoMsg(updates.include.length + " streamer(s) to include");
                list = updates.include;
                updates.include = [];
            }
        }
        else if (!updates.exclude) {
            updates.exclude = [];
        }
        else if (updates.exclude.length > 0) {
            this.infoMsg(updates.exclude.length + " streamer(s) to exclude");
            list = updates.exclude;
            updates.exclude = [];
        }
        // clear the processed array from file
        if (list.length > 0) {
            fs.writeFileSync(this.updateName, yaml.safeDump(updates), "utf8");
        }
        try {
            const dirty = await this.updateStreamers(list, options);
            if (dirty) {
                await this.writeConfig();
            }
        }
        catch (err) {
            this.errMsg(err.toString());
        }
    }
    async updateList(id, options) {
        let dirty = false;
        const list = options.isTemp ? this.tempList : this.config.streamers;
        if (options.pause) {
            if (this.streamerList.has(id.uid)) {
                let streamer = this.streamerList.get(id.uid);
                if (streamer && options.pausetimer && options.pausetimer > 0) {
                    const print = streamer.paused ? " pausing for " : " unpausing for ";
                    this.infoMsg(colors.name(id.nm) + print + options.pausetimer + " seconds");
                    await sleep(options.pausetimer * 1000);
                    this.infoMsg(colors.name(id.nm) + " pause-timer expired");
                    streamer = this.streamerList.get(id.uid);
                }
                const toggle = await this.togglePause(streamer, options);
                if (toggle) {
                    dirty = true;
                    this.render(true);
                }
            }
        }
        else if (options.add) {
            this.infoMsg("id.nm = " + id.nm);
            const added = await this.addStreamer(id, list, options);
            if (added) {
                list.push(this.createListItem(id));
                dirty = true;
            }
        }
        else if (this.removeStreamer(id, list)) {
            for (let i = 0; i < this.config.streamers.length; i++) {
                if (this.config.streamers[i][0] === id.uid) {
                    list.splice(i, 1);
                    dirty = true;
                    break;
                }
            }
        }
        if (dirty) {
            if (options.isTemp) {
                this.tempList = list;
            }
            else {
                this.config.streamers = list;
            }
        }
        return dirty && !options.isTemp;
    }
    async pause() {
        this.paused = !this.paused;
        for (const [, streamer] of this.streamerList) {
            streamer.paused = this.paused;
            if (this.paused) {
                this.haltCapture(streamer.uid);
            }
            else if (streamer.state !== "Offline") {
                await this.refresh(streamer);
            }
        }
        this.render(true);
    }
    async updateStreamers(list, options) {
        let dirty = false;
        for (const entry of list) {
            const id = {
                uid: entry,
                nm: entry
            };
            dirty = await this.updateList(id, { add: options.add, pause: 0, isTemp: false, init: options.init }) || dirty;
        }
        return dirty;
    }
    async addStreamer(id, list, options) {
        let added = true;
        for (const entry of list) {
            if (entry[0] === id.uid) {
                this.errMsg(colors.name(id.nm) + " is already in the capture list");
                added = false;
                break;
            }
        }
        if (added) {
            this.infoMsg(colors.name(id.nm) + " added to capture list" + (options.isTemp ? " (temporarily)" : ""));
        }
        if (!this.streamerList.has(id.uid)) {
            this.streamerList.set(id.uid, {
                uid: id.uid,
                nm: id.nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                capture: null,
                postProcess: false,
                filesize: 0,
                stuckcounter: 0,
                isTemp: options.isTemp,
                paused: this.paused,
            });
            this.render(true);
            if (!options || !options.init) {
                const streamer = this.streamerList.get(id.uid);
                await this.refresh(streamer, options);
            }
        }
        return added;
    }
    removeStreamer(id, list) {
        if (this.streamerList.has(id.uid)) {
            this.infoMsg(colors.name(id.nm) + " removed from capture list.");
            this.haltCapture(id.uid);
            this.streamerList.delete(id.uid); // Note: deleting before recording/post-processing finishes
            this.render(true);
            return true;
        }
        this.errMsg(colors.name(id.nm) + " not in capture list.");
        return false;
    }
    async checkStreamerState(streamer, options) {
        if (streamer && streamer.state !== options.prevState) {
            this.infoMsg(options.msg);
            this.redrawList = true;
        }
        if (streamer && streamer.postProcess === false && streamer.capture !== null && !options.isStreaming) {
            // Sometimes the recording process doesn't end when a streamer
            // stops broadcasting, so terminate it.
            this.dbgMsg(colors.name(streamer.nm) + " is no longer broadcasting, terminating capture process (pid=" + streamer.capture.pid + ")");
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }
        this.render(false);
    }
    async getStreamers(options) {
        if (this.dvr.tryingToExit) {
            this.dbgMsg("Skipping lookup while exit in progress...");
            return false;
        }
        this.checkFileSize();
        return true;
    }
    storeCapInfo(streamer, filename, capture, isPostProcess) {
        streamer.filename = filename;
        streamer.capture = capture;
        if (isPostProcess) {
            streamer.postProcess = true;
            this.redrawList = true;
        }
        this.render(true);
    }
    getNumCapsInProgress() {
        let count = 0;
        for (const streamer of this.streamerList.values()) {
            if (streamer.capture !== null) {
                count++;
            }
        }
        return count;
    }
    haltAllCaptures() {
        for (const streamer of this.streamerList.values()) {
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }
    haltCapture(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }
    async writeConfig() {
        let filehandle;
        try {
            filehandle = await fs.promises.open(this.cfgFile, "w");
            await filehandle.writeFile(yaml.safeDump(this.config));
        }
        finally {
            if (filehandle) {
                this.dbgMsg("Rewriting " + this.cfgFile);
                await filehandle.close();
            }
            else {
                this.errMsg("Could not write " + this.cfgFile);
            }
        }
    }
    canStartCap(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null) {
                this.dbgMsg(colors.name(streamer.nm) + " is already capturing");
                return false;
            }
            return true;
        }
        return false;
    }
    async getCompleteDir(streamer) {
        let completeDir = this.dvr.config.recording.completeDirectory;
        if (this.dvr.config.recording.siteSubdir) {
            completeDir += "/" + this.siteName;
        }
        if (this.dvr.config.recording.streamerSubdir) {
            completeDir += "/" + streamer.nm;
            if (this.dvr.config.recording.includeSiteInDir) {
                completeDir += "_" + this.listName;
            }
            try {
                await fs.promises.mkdir(completeDir, { recursive: true });
            }
            catch (err) {
                this.errMsg(err.toString());
            }
        }
        return completeDir;
    }
    async refresh(streamer, options) {
        if (streamer && !this.dvr.tryingToExit && this.streamerList.has(streamer.uid)) {
            if (!options || !options.init) {
                await this.checkStreamerState(streamer);
            }
        }
    }
    startCapture(capInfo) {
        if (capInfo.spawnArgs === "") {
            return;
        }
        const streamer = capInfo.streamer;
        const script = this.dvr.calcPath(this.config.recorder);
        const capture = child_process_1.spawn(script, capInfo.spawnArgs);
        this.dbgMsg("Starting recording: " +
            colors.cmd(script) + " " + colors.cmd(capInfo.spawnArgs.join(" ")));
        if (this.dvr.config.debug.recorder) {
            const logStream = fs.createWriteStream("./" + capInfo.filename + ".log", { flags: "w" });
            capture.stdout.pipe(logStream);
            capture.stderr.pipe(logStream);
        }
        if (capture.pid) {
            const filename = capInfo.filename + ".ts";
            this.infoMsg(colors.name(streamer.nm) + " recording started: " + colors.file(filename));
            this.storeCapInfo(streamer, filename, capture, false);
        }
        else {
            this.errMsg(colors.name(streamer.nm) + " capture failed to start");
        }
        capture.on("close", () => {
            this.endCapture(streamer, capInfo);
        });
    }
    async endCapture(streamer, capInfo) {
        const fullname = capInfo.filename + ".ts";
        fs.stat(this.dvr.config.recording.captureDirectory + "/" + fullname, (err, stats) => {
            if (err) {
                if (err.code === "ENOENT") {
                    this.errMsg(colors.name(streamer.nm) + ", " + colors.file(capInfo.filename) + ".ts not found in capturing directory, cannot convert to " + this.dvr.config.recording.autoConvertType);
                }
                else {
                    this.errMsg(colors.name(streamer.nm) + ": " + err.toString());
                }
                this.storeCapInfo(streamer, "", null, false);
            }
            else {
                const sizeMB = stats.size / 1048576;
                if (sizeMB < this.dvr.config.recording.minSize) {
                    this.infoMsg(colors.name(streamer.nm) + " recording automatically deleted (size=" + sizeMB + " < minSize=" + this.dvr.config.recording.minSize + ")");
                    fs.unlinkSync(this.dvr.config.recording.captureDirectory + "/" + fullname);
                    this.storeCapInfo(streamer, "", null, false);
                }
                else {
                    this.dvr.postProcess.add({ site: this, streamer: streamer, filename: capInfo.filename });
                }
            }
        });
        await this.refresh(streamer);
    }
    async clearProcessing(streamer) {
        // Note: setting postProcess to undefined releases program to exit
        this.storeCapInfo(streamer, "", null, false);
        this.redrawList = true;
        streamer.postProcess = false;
        await this.refresh(streamer);
    }
    render(redrawList) {
        if (this.dvr.config.tui.enable) {
            this.tui.render(redrawList || this.redrawList, this);
        }
    }
    infoMsg(msg) {
        this.dvr.infoMsg(msg, this);
    }
    errMsg(msg) {
        this.dvr.errMsg(msg, this);
    }
    dbgMsg(msg) {
        this.dvr.dbgMsg(msg, this);
    }
}
exports.Site = Site;
//# sourceMappingURL=site.js.map