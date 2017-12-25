const yaml         = require("js-yaml");
const mkdirp       = require("mkdirp");
const fs           = require("fs");
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

        // Handle to the parsed config.yml
        this.config = config;

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

        // Data accumulator for outstanding status lookup threads
        // reset on each loop
        this.streamersToCap = [];

        // Used for intelligent printouts to avoid log spam
        this.streamerState = new Map();

        // Outstanding ffmpeg jobs
        this.currentlyCapping = new Map();

        // Data used to render the displayed lists
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
            mouse: true,
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
            filename += this.siteName.trim().toLowerCase() + "_";
        }
        filename += this.getDateTime();
        return filename;
    }

    checkFileSize() {
        const maxByteSize = this.config.maxByteSize;
        if (maxByteSize === 0) {
            return;
        }

        for (const capInfo of this.currentlyCapping.values()) {
            const stat = fs.statSync(this.config.captureDirectory + "/" + capInfo.filename + ".ts");
            this.dbgMsg(colors.name(capInfo.nm) + " file size (" + capInfo.filename + ".ts), size=" + stat.size + ", maxByteSize=" + maxByteSize);
            if (stat.size >= maxByteSize) {
                this.msg(colors.name(capInfo.nm) + " recording has exceeded file size limit (size=" + stat.size + " > maxByteSize=" + maxByteSize + ")");
                capInfo.captureProcess.kill("SIGINT");
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

    updateList(streamer, list, add) {
        let rc;
        if (add) {
            rc = this.addStreamer(streamer, list);
        } else {
            rc = this.removeStreamer(streamer, list);
        }
        return rc;
    }

    updateStreamers(bundle, add) {
        const list = add ? bundle.includeStreamers : bundle.excludeStreamers;

        for (let i = 0; i < list.length; i++) {
            bundle.dirty |= this.updateList(list[i], add);
        }

        return bundle;
    }

    addStreamer(streamer, list) {
        const index = list.indexOf(streamer.uid);
        let rc = false;
        if (index === -1) {
            this.msg(colors.name(streamer.nm) + " added to capture list");
            rc = true;
        } else {
            this.msg(colors.name(streamer.nm) + " is already in the capture list");
        }
        if (!this.streamerList.has(streamer.nm)) {
            this.streamerList.set(streamer.nm, {uid: streamer.uid, nm: streamer.nm, streamerState: "Offline", filename: ""});
            this.render();
        }
        return rc;
    }

    removeStreamer(streamer) {
        this.msg(colors.name(streamer.nm) + " removed from capture list.");
        if (this.streamerList.has(streamer.nm)) {
            this.streamerList.delete(streamer.nm);
            this.render();
        }
        this.haltCapture(streamer.uid);
        return true;
    }

    addStreamerToCapList(streamer, filename, captureProcess) {
        this.currentlyCapping.set(streamer.uid, {nm: streamer.nm, filename: filename, captureProcess: captureProcess});
    }

    removeStreamerFromCapList(streamer) {
        this.currentlyCapping.delete(streamer.uid);
    }

    getNumCapsInProgress() {
        return this.currentlyCapping.size;
    }

    haltAllCaptures() {
        this.currentlyCapping.forEach((value) => {
            value.captureProcess.kill("SIGINT");
        });
    }

    haltCapture(uid) {
        if (this.currentlyCapping.has(uid)) {
            const capInfo = this.currentlyCapping.get(uid);

            capInfo.captureProcess.kill("SIGINT");
        }
    }

    writeConfig() {
        this.dbgMsg("Rewriting config.yml");
        fs.writeFileSync("config.yml", yaml.safeDump(this.config), "utf8");
    }

    setupCapture(streamer) {
        if (this.currentlyCapping.has(streamer.uid)) {
            this.dbgMsg(colors.name(streamer.nm) + " is already capturing");
            return false;
        }

        return true;
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

    startCapture(spawnArgs, filename, streamer) {
        const captureProcess = childProcess.spawn("ffmpeg", spawnArgs);

        const listitem = this.streamerList.get(streamer.nm);
        listitem.filename = filename + ".ts";
        this.streamerList.set(streamer.nm, listitem);

        captureProcess.on("close", () => {

            // When removing a streamer, the streamerList entry gets removed
            // before the ffmpeg process ends, so check if it exists.
            if (this.streamerList.has(streamer.nm)) {
                const li = this.streamerList.get(streamer.nm);
                li.filename = "";
                this.streamerList.set(streamer.nm, li);
            }

            this.removeStreamerFromCapList(streamer);

            fs.stat(this.config.captureDirectory + "/" + filename + ".ts", (err, stats) => {
                if (err) {
                    if (err.code === "ENOENT") {
                        this.errMsg(colors.name(streamer.nm) + ", " + filename + ".ts not found in capturing directory, cannot convert to " + this.config.autoConvertType);
                    } else {
                        this.errMsg(colors.name(streamer.nm) + ": " + err.toString());
                    }
                } else if (stats.size <= this.config.minByteSize) {
                    this.msg(colors.name(streamer.nm) + " recording automatically deleted (size=" + stats.size + " < minSizeBytes=" + this.config.minByteSize + ")");
                    fs.unlinkSync(this.config.captureDirectory + "/" + filename + ".ts");
                } else {
                    this.postProcess(filename, streamer);
                }
            });

            // Refresh streamer status since streamer has likely changed state
            if (this.streamerList.has(streamer.nm)) {
                const queries = [];
                queries.push(this.checkStreamerState(streamer.uid));
                Promise.all(queries).then(() => {
                    this.render();
                });
            }

        });

        if (captureProcess.pid) {
            this.msg(colors.name(streamer.nm) + " recording started (" + filename + ".ts)");
            this.render();
            this.addStreamerToCapList(streamer, filename, captureProcess);
        }
    }

    postProcess(filename, streamer) {
        const completeDir = this.getCompleteDir(streamer);
        let mySpawnArguments;

        if (this.config.autoConvertType !== "mp4" && this.config.autoConvertType !== "mkv") {
            this.dbgMsg(colors.name(streamer.nm) + " recording moved (" + this.config.captureDirectory + "/" + filename + ".ts to " + completeDir + "/" + filename + ".ts)");
            mv(this.config.captureDirectory + "/" + filename + ".ts", completeDir + "/" + filename + ".ts", (err) => {
                if (err) {
                    this.errMsg(colors.site(filename) + ": " + err.toString());
                }
            });
            return;
        }

        if (this.config.autoConvertType === "mp4") {
            mySpawnArguments = [
                "-hide_banner",
                "-v",
                "fatal",
                "-i",
                this.config.captureDirectory + "/" + filename + ".ts",
                "-c",
                "copy",
                "-bsf:a",
                "aac_adtstoasc",
                "-copyts",
                completeDir + "/" + filename + "." + this.config.autoConvertType
            ];
        } else if (this.config.autoConvertType === "mkv") {
            mySpawnArguments = [
                "-hide_banner",
                "-v",
                "fatal",
                "-i",
                this.config.captureDirectory + "/" + filename + ".ts",
                "-c",
                "copy",
                "-copyts",
                completeDir + "/" + filename + "." + this.config.autoConvertType
            ];
        }

        this.semaphore++;

        this.msg(colors.name(streamer.nm) + " converting to " + filename + "." + this.config.autoConvertType);

        const myCompleteProcess = childProcess.spawn("ffmpeg", mySpawnArguments);
        if (this.streamerList.has(streamer.nm)) {
            const listitem = this.streamerList.get(streamer.nm);
            listitem.filename = filename + "." + this.config.autoConvertType;
            this.streamerList.set(streamer.nm, listitem);
            this.render();
        }

        myCompleteProcess.on("close", () => {
            if (!this.config.keepTsFile) {
                fs.unlinkSync(this.config.captureDirectory + "/" + filename + ".ts");
            }
            this.msg(colors.name(streamer.nm) + " done converting " + filename + "." + this.config.autoConvertType);
            if (this.streamerList.has(streamer.nm)) {
                const li = this.streamerList.get(streamer.nm);
                li.filename = "";
                this.streamerList.set(streamer.nm, li);
                this.render();
            }
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

        const sortedKeys = Array.from(this.streamerList.keys()).sort();
        for (let i = 0; i < sortedKeys.length; i++) {
            const value = this.streamerList.get(sortedKeys[i]);
            let line = colors.name(value.nm);
            for (let j = 0; j < 16 - value.nm.length; j++) {
                line += " ";
            }
            line += value.streamerState === "Offline" ? colors.offline(value.streamerState) : colors.state(value.streamerState);
            for (let j = 0; j < 16 - value.streamerState.length; j++) {
                line += " ";
            }
            line += colors.file(value.filename);
            this.list.pushLine(line);
        }
        this.screen.render();
    }
}

exports.Site = Site;

