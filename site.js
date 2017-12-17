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
        this.semaphore = 0;
        this.siteName = siteName;
        this.config = config;

        this.streamersToCap = [];
        this.streamerState = new Map();
        this.currentlyCapping = new Map();
        this.siteDir = siteDir;
        this.screen = screen;
        this.logbody = logbody;
        this.inst = inst;
        this.total = total;
        this.streamerList = new Map();

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

        if (maxByteSize > 0) {
            for (const capInfo of this.currentlyCapping.values()) {
                const stat = fs.statSync(this.config.captureDirectory + "/" + capInfo.filename + ".ts");
                this.dbgMsg(colors.name(capInfo.nm) + " file size (" + capInfo.filename + ".ts), size=" + stat.size + ", maxByteSize=" + maxByteSize);
                if (stat.size >= maxByteSize) {
                    this.msg(colors.name(capInfo.nm) + " recording has exceeded file size limit (size=" + stat.size + " > maxByteSize=" + maxByteSize + ")");
                    capInfo.captureProcess.kill("SIGINT");
                }
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

    addStreamer(streamer, streamers) {
        const index = streamers.indexOf(streamer.uid);
        let rc = false;
        if (index === -1) {
            this.msg(colors.name(streamer.nm) + " added to capture list");
            rc = true;
        } else {
            this.msg(colors.name(streamer.nm) + " is already in the capture list");
        }
        if (!this.streamerList.has(streamer.nm)) {
            this.streamerList.set(streamer.nm, {uid: streamer.uid, nm: streamer.nm, streamerState: "Offline", filename: ""});
        }
        this.render();
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
        this.currentlyCapping.forEach(function(value) {
            value.captureProcess.kill("SIGINT");
        });
    }

    haltCapture(uid) {
        if (this.currentlyCapping.has(uid)) {
            const capInfo = this.currentlyCapping.get(uid);

            capInfo.captureProcess.kill("SIGINT");
        }
    }

    writeConfig(dirty) {
        if (dirty) {
            this.dbgMsg("Rewriting config.yml");
            fs.writeFileSync("config.yml", yaml.safeDump(this.config), "utf8");
        }
    }

    setupCapture(streamer, tryingToExit) {
        if (this.currentlyCapping.has(streamer.uid)) {
            this.dbgMsg(colors.name(streamer.nm) + " is already capturing");
            return false;
        }

        if (tryingToExit) {
            this.dbgMsg(colors.name(streamer.nm) + " capture not starting due to ctrl+c");
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

    startCapture(spawnArgs, filename, streamer, tryingToExit) {
        const me = this;
        const captureProcess = childProcess.spawn("ffmpeg", spawnArgs);

        const listitem = this.streamerList.get(streamer.nm);
        listitem.filename = filename + ".ts";
        this.streamerList.set(streamer.nm, listitem);

        captureProcess.on("close", function() {
            if (tryingToExit) {
                me.msg(colors.name(streamer.nm) + " capture interrupted");
            }

            if (me.streamerList.has(streamer.nm)) {
                // When removing a capturing streamer, the streamerList
                // entry gets removed before ffmpeg process ends.
                const li = me.streamerList.get(streamer.nm);
                li.filename = "";
                me.streamerList.set(streamer.nm, li);
            }

            me.removeStreamerFromCapList(streamer);

            fs.stat(me.config.captureDirectory + "/" + filename + ".ts", function(err, stats) {
                if (err) {
                    if (err.code === "ENOENT") {
                        me.errMsg(colors.name(streamer.nm) + ", " + filename + ".ts not found in capturing directory, cannot convert to " + me.config.autoConvertType);
                    } else {
                        me.errMsg(colors.name(streamer.nm) + ": " + err.toString());
                    }
                } else if (stats.size <= me.config.minByteSize) {
                    me.msg(colors.name(streamer.nm) + " recording automatically deleted (size=" + stats.size + " < minSizeBytes=" + me.config.minByteSize + ")");
                    fs.unlinkSync(me.config.captureDirectory + "/" + filename + ".ts");
                } else {
                    me.postProcess(filename, streamer);
                }
            });

            // Refresh streamer status since streamer has likely changed state
            if (me.streamerList.has(streamer.nm)) {
                const queries = [];
                queries.push(me.checkStreamerState(streamer.uid));
                Promise.all(queries).then(function() {
                    me.render();
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
        const me = this;
        const completeDir = this.getCompleteDir(streamer);
        let mySpawnArguments;

        if (this.config.autoConvertType !== "mp4" && this.config.autoConvertType !== "mkv") {
            this.dbgMsg(colors.name(streamer.nm) + " recording moved (" + this.config.captureDirectory + "/" + filename + ".ts to " + completeDir + "/" + filename + ".ts)");
            mv(this.config.captureDirectory + "/" + filename + ".ts", completeDir + "/" + filename + ".ts", function(err) {
                if (err) {
                    me.errMsg(colors.site(filename) + ": " + err.toString());
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

        myCompleteProcess.on("close", function() {
            if (!me.config.keepTsFile) {
                fs.unlinkSync(me.config.captureDirectory + "/" + filename + ".ts");
            }
            me.msg(colors.name(streamer.nm) + " done converting " + filename + "." + me.config.autoConvertType);
            if (me.streamerList.has(streamer.nm)) {
                const li = me.streamerList.get(streamer.nm);
                li.filename = "";
                me.streamerList.set(streamer.nm, li);
                me.render();
            }
            me.semaphore--; // release semaphore only when ffmpeg process has ended
        });

        myCompleteProcess.on("error", function(err) {
            me.errMsg(err);
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
        const me = this;

        // TODO: Hack
        for (let i = 0; i < 100; i++) {
            me.list.deleteLine(0);
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

