const yaml    = require("js-yaml");
const fs      = require("fs");
const _       = require("underscore");
const moment  = require("moment");
const colors  = require("colors/safe");
const {spawn} = require("child_process");

class Site {
    constructor(siteName, dvr, tui) {
        this.siteName   = siteName;
        this.padName    = siteName.padEnd(9, " ");
        this.listName   = siteName.toLowerCase();
        this.cfgname    = dvr.configdir + this.listName + ".yml";
        this.updatename = dvr.configdir + this.listName + "_updates.yml";

        // site.yml
        this.siteConfig = yaml.safeLoad(fs.readFileSync(this.cfgname, "utf8"));

        this.siteDir = "_" + this.listName; // Directory suffix
        this.dvr = dvr;                     // Handle to parent dvr for global post-process queue
        this.tui = tui;                     // Blessed UI elements
        this.tempList = [];                 // temp record list (session only)
        this.streamerList = new Map();      // Refer to addStreamer() for JSON entries
        this.streamerListDamaged = false;

        if (this.dvr.config.tui.enable) {
            tui.addSite(this);
        }

        this.infoMsg(this.siteConfig.streamers.length + " streamer(s) in config");

        if (typeof this.siteConfig.siteUrl === "undefined") {
            this.errMsg(this.cfgname + " is missing siteUrl");
        }
    }

    getDateTime() {
        return moment().format(this.dvr.config.recording.dateFormat);
    }

    getStreamerList() {
        return Array.from(this.streamerList.values());
    }

    getFileName(nm) {
        const site = this.dvr.config.recording.includeSiteInFile ? this.listName + "_" : "";
        return nm + "_" + site + this.getDateTime();
    }

    checkFileSize() {
        const maxSize = this.dvr.config.recording.maxSize;
        for (const streamer of this.streamerList.values()) {
            if (streamer.captureProcess === null) {
                continue;
            }

            const stat = fs.statSync(this.dvr.config.recording.captureDirectory + "/" + streamer.filename);
            const sizeMB = Math.round(stat.size / 1048576);
            this.dbgMsg(colors.file(streamer.filename) + ", size=" + sizeMB + "MB, maxSize=" + maxSize + "MB");
            if (sizeMB === streamer.filesize) {
                this.infoMsg(colors.name(streamer.nm) + " recording appears to be stuck (counter=" + streamer.stuckcounter + "), file size is not increasing: " + sizeMB + "MB");
                streamer.stuckcounter++;
            } else {
                streamer.filesize = sizeMB;
            }
            if (streamer.stuckcounter >= 2) {
                this.infoMsg(colors.name(streamer.nm) + " terminating stuck recording");
                this.haltCapture(streamer.uid);
                streamer.stuckcounter = 0;
                this.streamerListDamaged = true;
            } else if (maxSize !== 0 && sizeMB >= maxSize) {
                this.infoMsg(colors.name(streamer.nm) + " recording has exceeded file size limit (size=" + sizeMB + " > maxSize=" + maxSize + ")");
                this.haltCapture(streamer.uid);
                this.streamerListDamaged = true;
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
            this.dvr.config.recording.captureDirectory + "/" + filename + ".ts",
            url,
            this.dvr.config.proxy.enable ? "1" : "0",
            this.dvr.config.proxy.server,
            this.dvr.config.debug.recorder ? "1" : "0"
        ];

        if (options && options.params) {
            args = args.concat(options.params);
        }

        return args;
    }

    async processUpdates(options) {
        const stats = fs.statSync(this.updatename);
        if (!stats.isFile()) {
            this.dbgMsg(this.updatename + " does not exist");
            return;
        }

        const updates = yaml.safeLoad(fs.readFileSync(this.updatename, "utf8"));
        let streamers = [];

        if (options.add) {
            if (!updates.include) {
                updates.include = [];
            } else if (updates.include.length > 0) {
                this.infoMsg(updates.include.length + " streamer(s) to include");
                streamers = updates.include;
                updates.include = [];
            }
        } else if (!updates.exclude) {
            updates.exclude = [];
        } else if (updates.exclude.length > 0) {
            this.infoMsg(updates.exclude.length + " streamer(s) to exclude");
            streamers = updates.exclude;
            updates.exclude = [];
        }

        // clear the processed array from file
        if (streamers.length > 0) {
            fs.writeFileSync(this.updatename, yaml.safeDump(updates), "utf8");
        }

        try {
            const dirty = await this.updateStreamers(streamers, options.add);
            if (dirty) {
                await this.writeConfig();
            }
        } catch (err) {
            this.errMsg(err.toString());
        }
    }

    updateList(streamer, options) {
        let dirty = false;
        let list = options.isTemp ? this.tempList : this.siteConfig.streamers;
        if (options.pause > 0) {
            if (this.streamerList.has(streamer.uid)) {
                const item = this.streamerList.get(streamer.uid);
                if (options.pause === 1) {
                    this.infoMsg(colors.name(streamer.nm) + " is paused.");
                    item.paused = true;
                    this.haltCapture(streamer.uid);
                } else if (options.pause === 2) {
                    this.infoMsg(colors.name(streamer.nm) + " is unpaused.");
                    item.paused = false;
                    this.refresh(streamer.uid);
                }
                this.streamerListDamaged = true;
                if (this.dvr.config.tui.enable) {
                    this.tui.render();
                }
            }
            return false;
        } else if (options.add) {
            if (this.addStreamer(streamer, list, options.isTemp)) {
                list.push(streamer.uid);
                dirty = true;
            }
        } else if (this.removeStreamer(streamer, list)) {
            if (this.siteConfig.streamers.indexOf(streamer.uid) !== -1) {
                list = _.without(list, streamer.uid);
                dirty = true;
            }
        }
        if (dirty) {
            if (options.isTemp) {
                this.tempList = list;
            } else {
                this.siteConfig.streamers = list;
            }
        }
        return dirty && !options.isTemp;
    }

    pause(state) {
        this.streamerList.forEach((value) => {
            value.paused = state;
            if (state) {
                this.haltCapture(value.uid);
            } else if (value.state !== "Offline") {
                this.refresh(value.uid);
            }
        });
        this.streamerListDamaged = true;
        if (this.dvr.config.tui.enable) {
            this.tui.render();
        }
    }

    updateStreamers(list, add) {
        let dirty = false;

        for (let i = 0; i < list.length; i++) {
            dirty |= this.updateList(list[i], {add: add, pause: 0, isTemp: false});
        }

        return dirty;
    }

    addStreamer(streamer, list, isTemp) {
        if (typeof streamer === "undefined") {
            // For mfc, when a bad username is looked up, an empty
            // object is returned
            return false;
        }

        let added = false;
        if (list.indexOf(streamer.uid) === -1) {
            this.infoMsg(colors.name(streamer.nm) + " added to capture list" + (isTemp ? " (temporarily)" : ""));
            added = true;
        } else {
            this.errMsg(colors.name(streamer.nm) + " is already in the capture list");
        }
        if (!this.streamerList.has(streamer.uid)) {
            this.streamerList.set(streamer.uid, {
                uid: streamer.uid,
                nm: streamer.nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                captureProcess: null,
                postProcess: 0,
                filesize: 0,
                stuckcounter: 0,
                isTemp: isTemp,
                paused: false
            });
            this.streamerListDamaged = true;
            if (this.dvr.config.tui.enable) {
                this.tui.render();
            }
        }
        return added;
    }

    removeStreamer(streamer) {
        let dirty = false;
        if (this.streamerList.has(streamer.uid)) {
            this.infoMsg(colors.name(streamer.nm) + " removed from capture list.");
            this.haltCapture(streamer.uid);
            this.streamerList.delete(streamer.uid); // Note: deleting before recording/post-processing finishes
            this.streamerListDamaged = true;
            if (this.dvr.config.tui.enable) {
                this.tui.render();
            }
            dirty = true;
        } else {
            this.errMsg(colors.name(streamer.nm) + " not in capture list.");
        }
        return dirty;
    }

    checkStreamerState(streamer, msg, isStreaming, prevState) {
        if (streamer.state !== prevState) {
            this.infoMsg(msg);
            this.streamerListDamaged = true;
        }
        if (streamer.postProcess === 0 && streamer.captureProcess !== null && !isStreaming) {
            // Sometimes the recording process doesn't end when a streamer
            // stops broadcasting, so terminate it.
            this.dbgMsg(colors.name(streamer.nm) + " is no longer broadcasting, ending " + this.siteConfig.recorder + " capture process.");
            this.haltCapture(streamer.uid);
        }
        if (this.dvr.config.tui.enable) {
            this.tui.render();
        }
    }

    getStreamers() {
        if (this.dvr.tryingToExit) {
            this.dbgMsg("Skipping lookup while exit in progress...");
            return false;
        }
        this.checkFileSize();
        return true;
    }

    storeCapInfo(uid, filename, captureProcess) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            streamer.filename = filename;
            streamer.captureProcess = captureProcess;
            this.streamerListDamaged = true;
            if (this.dvr.config.tui.enable) {
                this.tui.render();
            }
        }
    }

    getNumCapsInProgress() {
        let count = 0;

        this.streamerList.forEach((value) => {
            count += value.captureProcess !== null;
        });

        return count;
    }

    haltAllCaptures() {
        this.streamerList.forEach((streamer) => {
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.captureProcess !== null && streamer.postProcess === 0) {
                streamer.captureProcess.kill("SIGINT");
            }
        });
    }

    haltCapture(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer.captureProcess !== null && streamer.postProcess === 0) {
                streamer.captureProcess.kill("SIGINT");
            }
        }
    }

    async writeConfig() {
        let filehandle;
        try {
            filehandle = await fs.promises.open(this.cfgname, "w");
            await filehandle.writeFile(yaml.safeDump(this.siteConfig));
        } finally {
            if (filehandle) {
                this.dbgMsg("Rewriting " + this.cfgname);
                await filehandle.close();
            } else {
                this.errMsg("Could not write " + this.cfgname);
            }
        }
    }

    setupCapture(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer.captureProcess !== null) {
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
                completeDir += this.siteDir;
            }
            try {
                await fs.promises.mkdir(completeDir, {recursive: true});
            } catch (err) {
                this.errMsg(err.toString());
            }
        }

        return completeDir;
    }

    async refresh(uid) {
        if (!this.dvr.tryingToExit && this.streamerList.has(uid)) {
            await this.checkStreamerState(uid);
        }
    }

    startCapture(capInfo) {
        if (capInfo.spawnArgs === "") {
            return;
        }

        const streamer = capInfo.streamer;
        const fullname = capInfo.filename + ".ts";

        this.dbgMsg("Starting recording: " + colors.cmd(this.siteConfig.recorder + " " + capInfo.spawnArgs.toString().replace(/,/g, " ")));
        const captureProcess = spawn(this.siteConfig.recorder, capInfo.spawnArgs, {windowsVerbatimArguments: true});

        if (this.dvr.config.debug.recorder) {
            const logStream = fs.createWriteStream("./" + capInfo.filename + ".log", {flags: "w"});
            captureProcess.stdout.pipe(logStream);
            captureProcess.stderr.pipe(logStream);
        }

        if (captureProcess.pid) {
            this.infoMsg(colors.name(streamer.nm) + " recording started: " + colors.file(capInfo.filename + ".ts"));
            this.storeCapInfo(streamer.uid, fullname, captureProcess);
        }

        captureProcess.on("close", () => {

            fs.stat(this.dvr.config.recording.captureDirectory + "/" + fullname, (err, stats) => {
                if (err) {
                    if (err.code === "ENOENT") {
                        this.errMsg(colors.name(streamer.nm) + ", " + colors.file(capInfo.filename) + ".ts not found in capturing directory, cannot convert to " + this.dvr.config.recording.autoConvertType);
                    } else {
                        this.errMsg(colors.name(streamer.nm) + ": " + err.toString());
                    }
                    this.storeCapInfo(streamer.uid, "", null);
                } else {
                    const sizeMB = stats.size / 1048576;
                    if (sizeMB < this.dvr.config.recording.minSize) {
                        this.infoMsg(colors.name(streamer.nm) + " recording automatically deleted (size=" + sizeMB + " < minSize=" + this.dvr.config.recording.minSize + ")");
                        fs.unlinkSync(this.dvr.config.recording.captureDirectory + "/" + fullname);
                        this.storeCapInfo(streamer.uid, "", null);
                    } else {
                        this.dvr.postProcessQ.push({site: this, streamer: streamer, filename: capInfo.filename});
                        if (this.dvr.postProcessQ.length === 1) {
                            this.dvr.postProcess();
                        }
                    }
                }
            });

            this.refresh(streamer.uid);
        });
    }

    setProcessing(streamer) {
        // Need to remember post-processing is happening, so that
        // the offline check does not kill postprocess jobs.
        if (this.streamerList.has(streamer.uid)) {
            const item = this.streamerList.get(streamer.uid);
            item.postProcess = 1;
            this.streamerListDamaged = true;
        }
    }

    clearProcessing(streamer) {
        // Note: When manually deleting a streamer that is actively recording,
        // the record process callback occurs after the streamer is already
        // removed from streamerList
        if (this.streamerList.has(streamer.uid)) {
            const item = this.streamerList.get(streamer.uid);

            // Note: setting postProcess to null releases program to exit
            this.storeCapInfo(streamer.uid, "", null);
            this.streamerListDamaged = true;

            if (item !== null) {
                item.postProcess = 0;
            }

            this.refresh(streamer.uid);
        }
    }

    msg(msg, options) {
        this.dvr.log(colors.time("[" + this.getDateTime() + "] ") + colors.site(this.padName) + msg, options);
    }

    infoMsg(msg) {
        this.msg("[INFO]  " + msg);
    }

    errMsg(msg) {
        this.msg(colors.error("[ERROR] ") + msg, {trace: true});
    }

    dbgMsg(msg) {
        if (this.dvr.config.debug.log) {
            this.msg(colors.debug("[DEBUG] ") + msg);
        }
    }
}

exports.Site = Site;

