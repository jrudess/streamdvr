"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Site = exports.UpdateCmd = void 0;
const path = require("path");
const yaml = require("js-yaml");
const child_process_1 = require("child_process");
const dvr_1 = require("./dvr");
const colors = require("colors");
const fs = require("fs");
const fsp = require("fs").promises;
var UpdateCmd;
(function (UpdateCmd) {
    UpdateCmd[UpdateCmd["REMOVE"] = 0] = "REMOVE";
    UpdateCmd[UpdateCmd["ADD"] = 1] = "ADD";
    UpdateCmd[UpdateCmd["PAUSE"] = 2] = "PAUSE";
    UpdateCmd[UpdateCmd["EN_DIS"] = 3] = "EN_DIS";
})(UpdateCmd || (exports.UpdateCmd = UpdateCmd = {}));
class Site {
    config;
    siteName;
    padName;
    listName;
    streamerList;
    redrawList;
    cfgFile;
    updateName;
    paused;
    pauseIndex;
    running;
    dvr;
    tui;
    constructor(siteName, dvr, tui) {
        this.siteName = siteName;
        this.dvr = dvr;
        this.tui = tui;
        this.padName = siteName.padEnd(8, " ");
        this.listName = siteName.toLowerCase();
        this.cfgFile = path.join(dvr.configdir, `${this.listName}.yml`);
        this.updateName = path.join(dvr.configdir, `${this.listName}_updates.yml`);
        try {
            this.config = yaml.load(fs.readFileSync(this.cfgFile, "utf8"));
        }
        catch (e) {
            this.print(dvr_1.MSG.ERROR, e.toString());
            process.exit(1);
        }
        this.streamerList = new Map();
        this.redrawList = false;
        this.paused = false;
        this.pauseIndex = 1;
        this.running = false;
        if (dvr.config.tui.enable) {
            tui.addSite(this);
        }
        this.print(dvr_1.MSG.INFO, `${this.config.streamers.length.toString()} streamer(s) in config`);
        if (typeof this.config.siteUrl === "undefined") {
            this.print(dvr_1.MSG.ERROR, `${this.cfgFile} is missing siteUrl`);
        }
    }
    async sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
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
    async checkFileSize(streamer, file) {
        const maxSize = this.dvr.config.recording.maxSize;
        const stat = await fsp.stat(file);
        const sizeMB = Math.round(stat.size / 1048576);
        this.print(dvr_1.MSG.DEBUG, `${colors.file(streamer.filename)}, size=${sizeMB.toString()}MB, maxSize=${maxSize.toString()}MB`);
        if (sizeMB === streamer.filesize) {
            streamer.stuckcounter++;
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} recording appears to be stuck (counter=` +
                `${streamer.stuckcounter.toString()}), file size is not increasing: ${sizeMB.toString()}MB`);
        }
        else {
            streamer.filesize = sizeMB;
        }
        if (streamer.stuckcounter >= 2) {
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} terminating stuck recording`);
            this.haltCapture(streamer.uid);
            streamer.stuckcounter = 0;
            this.redrawList = true;
        }
        else if (maxSize !== 0 && sizeMB >= maxSize) {
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} recording has exceeded file size limit (size=` +
                `${sizeMB.toString()} > maxSize=${maxSize.toString()})`);
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }
        return true;
    }
    async processStreamers() {
        for (const streamer of this.streamerList.values()) {
            if (streamer.capture === undefined || streamer.postProcess) {
                continue;
            }
            const file = path.join(this.dvr.config.recording.captureDirectory, streamer.filename);
            try {
                await this.checkFileSize(streamer, file);
            }
            catch (err) {
                if (err.code === "ENOENT") {
                    this.print(dvr_1.MSG.ERROR, `${colors.name(streamer.nm)}, ${colors.file(file)} not found ` +
                        "in capturing directory, cannot check file size");
                }
                else {
                    this.print(dvr_1.MSG.ERROR, `${colors.name(streamer.nm)}: ${err.toString()}`);
                }
            }
        }
        return true;
    }
    start() {
        this.running = true;
        this.print(dvr_1.MSG.DEBUG, "Site started");
    }
    stop() {
        this.running = false;
        this.haltAllCaptures();
        this.streamerList.clear();
        this.print(dvr_1.MSG.DEBUG, "Site stopped");
    }
    isRunning() {
        return this.running;
    }
    getCaptureArguments(url, filename, params) {
        let args = [
            "-o",
            path.join(this.dvr.config.recording.captureDirectory, `${filename}.ts`),
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
            args.push(`--${this.listName}-username=${this.config.username}`);
        }
        if (this.config.password) {
            args.push(`--${this.listName}-password=${this.config.password}`);
        }
        if (this.config.recorder_args) {
            args = args.concat(this.config.recorder_args);
        }
        if (params) {
            args = args.concat(params);
        }
        return args;
    }
    async processUpdates(cmd) {
        try {
            await fsp.access(this.updateName, fsp.F_OK);
        }
        catch {
            this.print(dvr_1.MSG.DEBUG, `${this.updateName} does not exist`);
            return;
        }
        let updates;
        try {
            const data = await fsp.readFile(this.updateName, "utf8");
            updates = yaml.load(data);
        }
        catch (e) {
            this.print(dvr_1.MSG.ERROR, e.toString());
            return;
        }
        let list = [];
        if (cmd === UpdateCmd.ADD) {
            if (updates.include && updates.include.length > 0) {
                this.print(dvr_1.MSG.INFO, `${updates.include.length} streamer(s) to include`);
                list = updates.include;
                updates.include = [];
            }
        }
        else if (cmd === UpdateCmd.REMOVE) {
            if (updates.exclude && updates.exclude.length > 0) {
                this.print(dvr_1.MSG.INFO, `${updates.exclude.length} streamer(s) to exclude`);
                list = updates.exclude;
                updates.exclude = [];
            }
        }
        // clear the processed array from file
        if (list.length > 0) {
            await fsp.writeFile(this.updateName, yaml.dump(updates), "utf8");
        }
        try {
            this.render(true);
            const dirty = await this.updateStreamers(list, cmd);
            if (dirty) {
                await this.writeConfig();
            }
        }
        catch (err) {
            this.print(dvr_1.MSG.ERROR, err.toString());
        }
    }
    async updateList(id, cmd, isTemp, pauseTimer) {
        let dirty = false;
        switch (cmd) {
            case UpdateCmd.PAUSE:
                dirty = await this.pauseStreamer(id, pauseTimer);
                break;
            case UpdateCmd.ADD:
                dirty = await this.addStreamer(id, isTemp);
                break;
            case UpdateCmd.REMOVE:
                dirty = this.removeStreamer(id);
                break;
            default:
                this.print(dvr_1.MSG.ERROR, "Unexpected cmd type");
                break;
        }
        return dirty;
    }
    async updateStreamers(list, cmd) {
        let dirty = false;
        for (const entry of list) {
            const tokens = entry.split(/,/);
            const id = {
                uid: tokens[0],
                nm: tokens.length > 1 ? tokens[1] : tokens[0],
            };
            dirty = await this.updateList(id, cmd) || dirty;
        }
        return dirty;
    }
    async addStreamer(id, isTemp) {
        let added = true;
        for (const entry of this.config.streamers) {
            if (entry[0] === id.uid) {
                this.print(dvr_1.MSG.ERROR, `${colors.name(id.nm)} is already in the capture list`);
                added = false;
                break;
            }
        }
        if (added) {
            this.print(dvr_1.MSG.INFO, `${colors.name(id.nm)} added to capture list` + (isTemp ? " (temporarily)" : ""));
            if (!isTemp) {
                this.config.streamers.push(this.createListItem(id));
            }
        }
        if (!this.streamerList.has(id.uid)) {
            const streamer = {
                uid: id.uid,
                nm: id.nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                capture: undefined,
                postProcess: false,
                filesize: 0,
                stuckcounter: 0,
                paused: this.paused,
                isTemp: isTemp ? true : false,
            };
            this.streamerList.set(id.uid, streamer);
            this.render(true);
            await this.refresh(streamer);
        }
        return added;
    }
    removeStreamer(id) {
        if (!this.streamerList.has(id.uid)) {
            this.print(dvr_1.MSG.ERROR, `${colors.name(id.nm)} not in capture list.`);
            return false;
        }
        this.print(dvr_1.MSG.INFO, `${colors.name(id.nm)} removed from capture list.`);
        this.haltCapture(id.uid);
        this.streamerList.delete(id.uid); // Note: deleting before recording/post-processing finishes
        this.render(true);
        for (let i = 0; i < this.config.streamers.length; i++) {
            const tokens = this.config.streamers[i][0].split(/,/);
            if (tokens[0] === id.uid) {
                this.config.streamers.splice(i, 1);
                break;
            }
        }
        return true;
    }
    async pauseStreamer(id, pauseTimer) {
        let dirty = false;
        let streamer = this.streamerList.get(id.uid);
        if (streamer && pauseTimer && pauseTimer > 0) {
            const print = streamer.paused ? "pausing for " : " unpausing for";
            this.print(dvr_1.MSG.INFO, `${colors.name(id.nm)} ${print} ${pauseTimer.toString()} seconds`);
            await this.sleep(pauseTimer * 1000);
            this.print(dvr_1.MSG.INFO, `${colors.name(id.nm)} pause-timer expired`);
            streamer = this.streamerList.get(id.uid);
        }
        if (streamer) {
            dirty = await this.togglePause(streamer);
            this.render(true);
        }
        return dirty;
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
    async togglePause(streamer) {
        if (streamer.paused) {
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} is unpaused.`);
            streamer.paused = false; // must be set before calling refresh()
            await this.refresh(streamer);
        }
        else {
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} is paused.`);
            streamer.paused = true;
            this.haltCapture(streamer.uid);
        }
        for (const item of this.config.streamers) {
            if (item[0] === streamer.uid) {
                item[this.pauseIndex] = item[this.pauseIndex] === "paused" ? "unpaused" : "paused";
                return true;
            }
        }
        return false;
    }
    async checkStreamerState(streamer, options) {
        if (!options) {
            this.print(dvr_1.MSG.ERROR, "site::checkStreamerState() options input is undefined");
            return;
        }
        if (this.dvr.tryingToExit) {
            this.print(dvr_1.MSG.DEBUG, `${colors.name(streamer.nm)} skipping lookup due to shutdown request`);
            return;
        }
        if (streamer.state !== options.prevState) {
            this.print(dvr_1.MSG.INFO, options.msg);
            this.redrawList = true;
        }
        if (streamer.postProcess === false && streamer.capture !== undefined && !options.isStreaming && !this.config.noTerminateOffline) {
            // This issue entirely depends on whether the yt-dlp and/or
            // streamlink process robustly ends when a broadcast stops
            // (normally or through some error case like internet disconnection).
            //
            // If the recording process doesn't terminate when a recording stops,
            // then if a new broadcast starts before the old process ends, a new
            // recording will not get launched for the new broadcast.  This hung
            // state can persist indefinitely if the recorder has bad behavior.
            //
            // To partially fix this, when a streamer is detected as offline,
            // stop the recording.  At the next polling loop the recording
            // will start over if the m3u8 lookup succeeds.
            //
            // This does not solve the case where the broadcast stops and
            // restarts between polling loops.  If the old record process does
            // not end, then future recordings will not start until some kind
            // of offline detection occurs during m3u8 lookup.  However, the
            // 'file size increasing' check will eventually trigger and kill
            // the process, but that takes 3 polling loops to recover.
            //
            // As a result of this fix, an m3u8 lookup glitch can cause a false
            // offline detection which will stop the recording, even though the
            // broadcast is still running.  In the normal case, as soon as the
            // next polling loop runs, the m3u8 lookup will succeed and a new
            // recording will start with only up to one-polling loop of
            // recording lost.   In the worst case, the website is broken or
            // partially down and so m3u8 lookup is broken.  The recording will
            // get killed due to the m3u8 lookup even though the broadcast is
            // running fine.  Handling for the website being broken like this is
            // rare enough to justify not supporting.
            this.print(dvr_1.MSG.DEBUG, `${colors.name(streamer.nm)} is no longer broadcasting, ` +
                `terminating capture process`);
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }
        if (options.isStreaming) {
            if (streamer.paused) {
                this.print(dvr_1.MSG.DEBUG, `${colors.name(streamer.nm)} is paused, recording not started.`);
            }
            else if (this.canStartCap(streamer.uid)) {
                await this.startCapture(this.setupCapture(streamer, options.m3u8));
            }
        }
        this.render(false);
    }
    async getStreamers() {
        if (this.dvr.tryingToExit) {
            this.print(dvr_1.MSG.DEBUG, "Skipping lookup while exit in progress...");
            return false;
        }
        await this.processStreamers();
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
            if (streamer.capture) {
                count++;
            }
        }
        return count;
    }
    haltAllCaptures() {
        for (const streamer of this.streamerList.values()) {
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.capture !== undefined && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }
    haltCapture(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== undefined && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
                this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} recording stopped`);
            }
        }
    }
    async writeConfig() {
        this.print(dvr_1.MSG.DEBUG, `Rewriting ${this.cfgFile}`);
        await fsp.writeFile(this.cfgFile, yaml.dump(this.config));
    }
    canStartCap(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== undefined) {
                this.print(dvr_1.MSG.DEBUG, `${colors.name(streamer.nm)} is already capturing`);
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
            await fsp.mkdir(completeDir, { recursive: true });
        }
        return completeDir;
    }
    async refresh(streamer) {
        if (this.config.enable && this.streamerList.has(streamer.uid)) {
            await this.checkStreamerState(streamer);
        }
    }
    async startCapture(capInfo) {
        if (!capInfo || !capInfo.streamer || capInfo.spawnArgs.length === 0) {
            return;
        }
        const streamer = capInfo.streamer;
        const script = this.dvr.calcPath(this.config.recorder);
        const capture = (0, child_process_1.spawn)(script, capInfo.spawnArgs);
        this.print(dvr_1.MSG.DEBUG, `Starting recording: ${colors.cmd(script)} ${colors.cmd(capInfo.spawnArgs.join(" "))}`);
        if (this.dvr.config.debug.recorder) {
            const logStream = fs.createWriteStream(`.${capInfo.filename}.log`, { flags: "w" });
            capture.stdout.pipe(logStream);
            capture.stderr.pipe(logStream);
        }
        if (capture.pid) {
            const filename = `${capInfo.filename}.ts`;
            this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} recording started: ${colors.file(filename)}`);
            this.storeCapInfo(streamer, filename, capture, false);
        }
        else {
            this.print(dvr_1.MSG.ERROR, `${colors.name(streamer.nm)} capture failed to start`);
        }
        capture.on("close", () => {
            void new Promise(async () => {
                await this.endCapture(streamer, capInfo);
            });
        });
    }
    async endCapture(streamer, capInfo) {
        const fullname = `${capInfo.filename}.ts`;
        try {
            const stats = await fsp.stat(path.join(this.dvr.config.recording.captureDirectory, fullname));
            if (stats) {
                const sizeMB = stats.size / 1048576;
                if (sizeMB < this.dvr.config.recording.minSize) {
                    this.print(dvr_1.MSG.INFO, `${colors.name(streamer.nm)} recording automatically deleted (size=${sizeMB.toString()}` +
                        ` < minSize=${this.dvr.config.recording.minSize.toString()})`);
                    await fsp.unlink(path.join(this.dvr.config.recording.captureDirectory, fullname));
                    this.storeCapInfo(streamer, "", undefined, false);
                }
                else {
                    await this.dvr.postProcess.add({
                        site: this,
                        streamer: streamer,
                        filename: capInfo.filename,
                        spawnArgs: [],
                    });
                }
            }
        }
        catch (err) {
            if (err.code === "ENOENT") {
                this.print(dvr_1.MSG.ERROR, `${colors.name(streamer.nm)}, ${colors.file(capInfo.filename + ".ts")} not found ` +
                    `in capturing directory, cannot convert to ${this.dvr.config.recording.autoConvertType}`);
            }
            else {
                this.print(dvr_1.MSG.ERROR, `${colors.name(streamer.nm)}: ${err.toString()}`);
            }
            this.storeCapInfo(streamer, "", undefined, false);
        }
        await this.refresh(streamer);
    }
    async clearProcessing(streamer) {
        // Note: setting postProcess to undefined releases program to exit
        this.storeCapInfo(streamer, "", undefined, false);
        this.redrawList = true;
        streamer.postProcess = false;
        await this.refresh(streamer);
    }
    render(redrawList) {
        if (this.dvr.config.tui.enable) {
            this.tui.render(redrawList || this.redrawList, this);
        }
    }
    print(lvl, msg) {
        this.dvr.print(lvl, msg, this);
    }
}
exports.Site = Site;
//# sourceMappingURL=site.js.map