const yaml         = require("js-yaml");
const mkdirp       = require("mkdirp");
const fs           = require("fs");
const _            = require("underscore");
const mv           = require("mv");
const moment       = require("moment");
const colors       = require("colors/safe");
const childProcess = require("child_process");
const blessed      = require("blessed");

class Site {
    constructor(siteName, config, siteDir, screen, logbody, inst, total) {
        // Sitename includes spaces to align log columns easily.
        // Use .trim() as needed.
        this.siteName = siteName;
        this.listName = siteName.trim().toLowerCase();

        // Handle to the cross-site config.yml
        this.config = config;

        // sitename.yml
        this.listConfig = yaml.safeLoad(fs.readFileSync(this.listName + ".yml", "utf8"));

        // Custom site directory suffix
        this.siteDir = siteDir;

        // Blessed UI elements
        this.screen = screen;
        this.logbody = logbody;

        // Site instance number and site total number
        this.inst = inst;
        this.total = total;

        // Counting semaphore to track outstanding post process ffmpeg jobs
        this.semaphore = 0;

        // Temporary data store used by child classes for outstanding status
        // lookup threads.  Is cleared and repopulated during each loop
        this.streamersToCap = [];

        // Streamers that are being temporarily captured for this session only
        this.tempList = [];

        // Data used to render the displayed lists
        // JSON data
        //     uid
        //     nm
        //     state
        //     filename
        //     captureProcess
        this.streamerList = new Map();

        // Calculate this site's screen layout based on its instance number
        // and the total number of sites.
        let top;
        let left;
        let width;
        let height;

        if (total === 4) {
            top  = inst === 4 ? 0 : inst === 3 ? "50%" : inst === 2 ? 0 : "50%";
            left = inst === 4 ? "50%" : inst === 3 ? 0 : inst === 2 ? "50%" : 0;
            width = "50%";
            height = "33%-1";
        } else if (total === 3) {
            top = 0;
            left = inst === 3 ? "66%+1" : inst === 2 ? "33%" : 0;
            width = inst === 1 ? "33%" : "33%+1";
            height = "66%-1";
        } else if (total === 2) {
            top = 0;
            left = inst === 2 ? "50%" : 0;
            width = "50%";
            height = "66%-1";
        } else if (total === 1) {
            top = 0;
            left = 0;
            width = "100%";
            height = "66%-1";
        }

        // Insert ourselves into the UI
        this.title = blessed.box({
            top: top,
            left: left,
            height: 1,
            width: width,
            keys: false,
            mouse: false,
            alwaysScroll: false,
            scrollable: false
        });

        this.list = blessed.box({
            top: top + 1,
            left: left,
            height: height,
            width: width,
            keys: true,
            mouse: false,
            alwaysScroll: true,
            scrollable: true,
            draggable: false,
            shadow: false,
            scrollbar: {
                ch: " ",
                bg: "red"
            },
            border : {
                type: "line",
                fg: "blue"
            }
        });

        screen.append(this.title);
        screen.append(this.list);

        this.title.pushLine(colors.site(this.siteName));
    }

    hide() {
        this.title.hide();
        this.list.hide();
    }

    show() {
        this.title.show();
        this.list.show();
    }

    full() {
        if (this.total === 4) {
            this.list.height = "50%-2";
        } else {
            this.list.height = "100%-2";
        }
    }

    restore() {
        if (this.total === 4) {
            this.list.height = "33%-1";
        } else {
            this.list.height = "66%-1";
        }
    }

    getSiteName() {
        return this.siteName;
    }

    getDateTime() {
        return moment().format(this.config.dateFormat);
    }

    getFileName(nm) {
        let filename = nm + "_";

        if (this.config.includeSiteInFile) {
            filename += this.listName + "_";
        }
        filename += this.getDateTime();
        return filename;
    }

    checkFileSize() {
        const maxByteSize = this.config.maxByteSize;
        if (maxByteSize === 0) {
            return;
        }

        for (const streamers of this.streamerList.values()) {
            if (streamers.captureProcess === null) {
                continue;
            }

            const stat = fs.statSync(this.config.captureDirectory + "/" + streamers.filename);
            this.dbgMsg(colors.name(streamers.nm) + " file size (" + streamers.filename + "), size=" + stat.size + ", maxByteSize=" + maxByteSize);
            if (stat.size >= maxByteSize) {
                this.msg(colors.name(streamers.nm) + " recording has exceeded file size limit (size=" + stat.size + " > maxByteSize=" + maxByteSize + ")");
                streamers.captureProcess.kill("SIGINT");
            }
        }
    }

    getCaptureArguments(url, filename) {
        return [
            "-hide_banner",
            "-v",
            "fatal",
            "-i",
            url,
            "-c",
            "copy",
            "-vsync",
            "2",
            "-r",
            "60",
            "-b:v",
            "500k",
            this.config.captureDirectory + "/" + filename + ".ts"
        ];
    }

    processUpdates() {
        const filename = this.listName + "_updates.yml";
        const stats = fs.statSync(filename);
        if (!stats.isFile()) {
            this.dbgMsg(filename + " does not exist");
            return {includeStreamers: [], excludeStreamers: [], dirty: false};
        }

        let includeStreamers = [];
        let excludeStreamers = [];

        const updates = yaml.safeLoad(fs.readFileSync(filename, "utf8"));

        if (!updates.include) {
            updates.include = [];
        } else if (updates.include.length > 0) {
            this.msg(updates.include.length + " streamer(s) to include");
            includeStreamers = updates.include;
            updates.include = [];
        }

        if (!updates.exclude) {
            updates.exclude = [];
        } else if (updates.exclude.length > 0) {
            this.msg(updates.exclude.length + " streamer(s) to exclude");
            excludeStreamers = updates.exclude;
            updates.exclude = [];
        }

        // if there were some updates, then rewrite updates.yml
        if (includeStreamers.length > 0 || excludeStreamers.length > 0) {
            fs.writeFileSync(filename, yaml.safeDump(updates), "utf8");
        }

        return {includeStreamers: includeStreamers, excludeStreamers: excludeStreamers, dirty: false};
    }

    updateList(streamer, add, isTemp) {
        let dirty = false;
        let list = isTemp ? this.tempList : this.listConfig.streamers;
        if (add) {
            if (this.addStreamer(streamer, list, isTemp)) {
                list.push(streamer.uid);
                dirty = !isTemp;
            }
        } else if (this.removeStreamer(streamer, list)) {
            if (this.listConfig.streamers.indexOf(streamer.uid) !== -1) {
                list = _.without(list, streamer.uid);
                dirty = !isTemp;
            }
        }
        if (isTemp) {
            this.tempList = list;
        } else {
            this.listConfig.streamers = list;
        }
        return dirty;
    }

    updateStreamers(bundle, add) {
        const list = add ? bundle.includeStreamers : bundle.excludeStreamers;

        for (let i = 0; i < list.length; i++) {
            bundle.dirty |= this.updateList(list[i], add, false);
        }

        return bundle;
    }

    addStreamer(streamer, list, isTemp) {
        const index = list.indexOf(streamer.uid);
        let rc = false;
        if (index === -1) {
            this.msg(colors.name(streamer.nm) + " added to capture list" + (isTemp ? " (temporarily)" : ""));
            rc = true;
        } else {
            this.msg(colors.name(streamer.nm) + " is already in the capture list");
        }
        if (!this.streamerList.has(streamer.uid)) {
            this.streamerList.set(streamer.uid, {uid: streamer.uid, nm: streamer.nm, state: "Offline", filename: "", captureProcess: null});
            this.render();
        }
        return rc;
    }

    removeStreamer(streamer) {
        this.msg(colors.name(streamer.nm) + " removed from capture list.");
        if (this.streamerList.has(streamer.uid)) {
            this.streamerList.delete(streamer.uid);
            this.render();
        }
        this.haltCapture(streamer.uid);
        return true;
    }

    checkStreamerState(streamer, msg, isStreaming, prevState) {
        if (streamer.state !== prevState) {
            this.msg(msg);
        }
        if (streamer.captureProcess !== null && !isStreaming) {
            // Sometimes the ffmpeg process doesn't end when a streamer
            // stops broadcasting, so terminate it.
            this.dbgMsg(colors.name(streamer.nm) + " is no longer broadcasting, ending ffmpeg process.");
            this.haltCapture(streamer.uid);
        }
    }

    storeCapInfo(uid, filename, captureProcess) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            streamer.filename = filename;
            streamer.captureProcess = captureProcess;
            this.render();
        }
    }

    recordStreamers(streamersToCap) {
        if (streamersToCap === null || streamersToCap.length === 0) {
            return null;
        }

        const caps = [];

        this.dbgMsg(streamersToCap.length + " streamer(s) to capture");
        for (let i = 0; i < streamersToCap.length; i++) {
            const cap = this.setupCapture(streamersToCap[i]).then((bundle) => {
                if (bundle.spawnArgs !== "") {
                    this.startCapture(bundle.streamer, bundle.filename, bundle.spawnArgs);
                }
            });
            caps.push(cap);
        }
        return Promise.all(caps);
    }

    getNumCapsInProgress() {
        let count = 0;

        this.streamerList.forEach((value) => {
            count += value.captureProcess !== null;
        });

        return count;
    }

    haltAllCaptures() {
        this.streamerList.forEach((value) => {
            if (value.captureProcess !== null) {
                value.captureProcess.kill("SIGINT");
            }
        });
    }

    haltCapture(uid) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer.captureProcess !== null) {
                streamer.captureProcess.kill("SIGINT");
            }
        }
    }

    writeConfig() {
        const filename = this.listName + ".yml";
        this.dbgMsg("Rewriting " + filename);
        fs.writeFileSync(filename, yaml.safeDump(this.listConfig), "utf8");
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

    getCompleteDir(streamer) {
        let completeDir = this.config.completeDirectory;

        if (this.config.streamerSubdir) {
            completeDir = completeDir + "/" + streamer.nm;
            if (this.config.includeSiteInDir) {
                completeDir += this.siteDir;
            }
            mkdirp.sync(completeDir);
        }

        return completeDir;
    }

    startCapture(streamer, filename, spawnArgs) {
        const fullname = filename + ".ts";
        const captureProcess = childProcess.spawn("ffmpeg", spawnArgs);

        if (captureProcess.pid) {
            this.msg(colors.name(streamer.nm) + " recording started (" + filename + ".ts)");
            this.storeCapInfo(streamer.uid, fullname, captureProcess);
        }

        captureProcess.on("close", () => {

            this.storeCapInfo(streamer.uid, "", null);

            fs.stat(this.config.captureDirectory + "/" + fullname, (err, stats) => {
                if (err) {
                    if (err.code === "ENOENT") {
                        this.errMsg(colors.name(streamer.nm) + ", " + filename + ".ts not found in capturing directory, cannot convert to " + this.config.autoConvertType);
                    } else {
                        this.errMsg(colors.name(streamer.nm) + ": " + err.toString());
                    }
                } else if (stats.size <= this.config.minByteSize) {
                    this.msg(colors.name(streamer.nm) + " recording automatically deleted (size=" + stats.size + " < minSizeBytes=" + this.config.minByteSize + ")");
                    fs.unlinkSync(this.config.captureDirectory + "/" + fullname);
                } else {
                    this.postProcess(streamer, filename);
                }
            });

            // Refresh streamer status since streamer has likely changed state
            if (this.streamerList.has(streamer.uid)) {
                const queries = [];
                queries.push(this.checkStreamerState(streamer.uid));
                Promise.all(queries).then(() => {
                    this.render();
                });
            }
        });
    }

    postProcess(streamer, filename) {
        const fullname = filename + ".ts";
        const completeDir = this.getCompleteDir(streamer);

        if (this.config.autoConvertType !== "mp4" && this.config.autoConvertType !== "mkv") {
            this.dbgMsg(colors.name(streamer.nm) + " recording moved (" + this.config.captureDirectory + "/" + filename + ".ts to " + completeDir + "/" + filename + ".ts)");
            mv(this.config.captureDirectory + "/" + fullname, completeDir + "/" + fullname, (err) => {
                if (err) {
                    this.errMsg(colors.site(filename) + ": " + err.toString());
                }
            });
            return;
        }

        const mySpawnArguments = [
            "-hide_banner",
            "-v",
            "fatal",
            "-i",
            this.config.captureDirectory + "/" + fullname,
            "-c",
            "copy"
        ];

        if (this.config.autoConvertType === "mp4") {
            mySpawnArguments.push("-bsf:a");
            mySpawnArguments.push("aac_adtstoasc");
        }

        mySpawnArguments.push("-copyts");
        mySpawnArguments.push(completeDir + "/" + filename + "." + this.config.autoConvertType);

        this.semaphore++;
        this.msg(colors.name(streamer.nm) + " converting to " + filename + "." + this.config.autoConvertType);

        const myCompleteProcess = childProcess.spawn("ffmpeg", mySpawnArguments);
        this.storeCapInfo(streamer.uid, filename + "." + this.config.autoConvertType, null);

        myCompleteProcess.on("close", () => {
            if (!this.config.keepTsFile) {
                fs.unlinkSync(this.config.captureDirectory + "/" + fullname);
            }
            this.msg(colors.name(streamer.nm) + " done converting " + filename + "." + this.config.autoConvertType);
            this.storeCapInfo(streamer.uid, "", null);
            this.semaphore--; // release semaphore only when ffmpeg process has ended
        });

        myCompleteProcess.on("error", (err) => {
            this.errMsg(err);
        });
    }

    msg(msg) {
        const line = colors.time("[" + this.getDateTime() + "]") + " " + colors.site(this.siteName) + " " + msg;
        this.logbody.pushLine(line);
        this.logbody.setScrollPerc(100);
        this.screen.render();
        console.log(line);
    }

    errMsg(msg) {
        this.msg(colors.error("[ERROR] ") + msg);
    }

    dbgMsg(msg) {
        if (this.config.debug) {
            this.msg(colors.debug("[DEBUG] ") + msg);
        }
    }

    render() {
        // TODO: Hack
        for (let i = 0; i < 300; i++) {
            this.list.deleteLine(0);
        }

        // Map keys are UID, but want to sort list by name.
        const sortedKeys = Array.from(this.streamerList.keys()).sort((a, b) => {
            if (this.streamerList.get(a).nm < this.streamerList.get(b).nm) {
                return -1;
            }
            if (this.streamerList.get(a).nm > this.streamerList.get(b).nm) {
                return 1;
            }
            return 0;
        });

        for (let i = 0; i < sortedKeys.length; i++) {
            const value = this.streamerList.get(sortedKeys[i]);
            let line = colors.name(value.nm);
            for (let j = 0; j < 16 - value.nm.length; j++) {
                line += " ";
            }
            line += value.state === "Offline" ? colors.offline(value.state) : colors.state(value.state);
            for (let j = 0; j < 16 - value.state.length; j++) {
                line += " ";
            }
            line += colors.file(value.filename);
            this.list.pushLine(line);
        }
        this.screen.render();
    }
}

exports.Site = Site;

