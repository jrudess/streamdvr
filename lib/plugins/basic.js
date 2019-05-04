"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);
const { Site } = require("../core/site");
const colors = require("colors");
// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap youtube-dl, streamlink, and ffmpeg.
class Basic extends Site {
    constructor(siteName, dvr, tui, urlback) {
        super(siteName, dvr, tui);
        this.urlback = urlback;
        if (this.config.streamers.length > 0) {
            if (this.config.streamers[0].constructor !== Array) {
                this.infoMsg("Upgrading " + this.cfgFile + " to new format, this is a one-time conversion.");
                this.convertFormat(this.config.streamers);
            }
        }
        for (let i = 0; i < this.config.streamers.length; i++) {
            const nm = this.config.streamers[i][0];
            const paused = this.config.streamers[i][1] === "paused";
            this.streamerList.set(nm, {
                uid: nm,
                nm: nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                capture: null,
                postProcess: 0,
                filsesize: 0,
                stuckcounter: 0,
                paused: paused
            });
        }
        this.redrawList = true;
    }
    convertFormat(streamerList) {
        return __awaiter(this, void 0, void 0, function* () {
            const newList = [];
            for (const streamer of streamerList.values()) {
                const newItem = [];
                newItem.push(streamer); // name
                newItem.push("unpaused");
                newList.push(newItem);
            }
            this.config.streamers = newList;
            yield this.writeConfig();
        });
    }
    updateList(nm, options) {
        return super.updateList({ nm: nm, uid: nm }, options);
    }
    createListItem(id) {
        const listItem = [];
        listItem.push(id.nm);
        listItem.push("unpaused");
        return listItem;
    }
    togglePause(streamer, options) {
        if (streamer) {
            for (let i = 0; i < this.config.streamers.length; i++) {
                if (this.config.streamers[i][0] === streamer.uid) {
                    if (this.config.streamers[i][1] === "paused") {
                        this.infoMsg(streamer.nm.name + " is unpaused.");
                        this.config.streamers[i][1] = "unpaused";
                        streamer.paused = false;
                        this.refresh(streamer, options);
                    }
                    else {
                        this.infoMsg(streamer.nm.name + " is paused.");
                        this.config.streamers[i][1] = "paused";
                        streamer.paused = true;
                        this.haltCapture(streamer.uid);
                    }
                    return true;
                }
            }
        }
        return false;
    }
    m3u8Script(nm) {
        return __awaiter(this, void 0, void 0, function* () {
            const streamerUrl = this.config.siteUrl + nm + this.urlback;
            const script = this.dvr.calcPath(this.config.m3u8fetch);
            let cmd = script + " -s " + streamerUrl;
            if (this.dvr.config.proxy.enable) {
                cmd = cmd + " -p " + this.dvr.config.proxy.server;
            }
            if (this.config.username) {
                cmd = cmd + " -u --" + this.listName + "-username=" + this.config.username;
            }
            if (this.config.password) {
                cmd = cmd + " -p --" + this.listName + "-password=" + this.config.password;
            }
            this.dbgMsg(colors.name(nm) + " running: " + colors.cmd(cmd));
            try {
                // m3u8 url in stdout
                const stdio = yield exec(cmd, { stdio: ["pipe", "pipe", "ignore"] });
                let url = stdio.stdout.toString();
                url = url.replace(/\r?\n|\r/g, "");
                return { status: true, m3u8: url };
            }
            catch (stdio) {
                if (stdio.stdout) {
                    this.errMsg(stdio.stdout);
                }
                if (stdio.stderr) {
                    this.errMsg(stdio.stderr);
                }
                return { status: false, m3u8: "" };
            }
        });
    }
    checkStreamerState(streamer, options) {
        const _super = Object.create(null, {
            checkStreamerState: { get: () => super.checkStreamerState }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // Detect if streamer is online or actively streaming
            const prevState = streamer.state;
            const stream = yield this.m3u8Script(streamer.nm);
            let msg = colors.name(streamer.nm);
            if (stream.status) {
                msg += " is streaming.";
                streamer.state = "Streaming";
            }
            else {
                msg += " is offline.";
                streamer.state = "Offline";
            }
            let newoptions = {};
            if (options) {
                newoptions = options;
            }
            newoptions.msg = msg;
            newoptions.isStreaming = stream.status;
            newoptions.prevState = prevState;
            _super.checkStreamerState.call(this, streamer, newoptions);
            if (stream.status) {
                if (streamer.paused) {
                    this.dbgMsg(streamer.nm.name + " is paused, recording not started.");
                }
                else if (!options || !options.init) {
                    this.startCapture(this.setupCapture(streamer, stream.m3u8));
                }
            }
        });
    }
    checkBatch(batch, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const queries = [];
            for (let i = 0; i < batch.length; i++) {
                const streamer = this.streamerList.get(batch[i]);
                queries.push(this.checkStreamerState(streamer, options));
            }
            try {
                yield Promise.all(queries);
                return true;
            }
            catch (err) {
                this.errMsg(err.toString());
                return false;
            }
        });
    }
    serialize(nms) {
        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.  Set batchSize to 0 for full parallel, or 1 for full serial.
        const serRuns = [];
        let count = 0;
        let batchSize = 5;
        if (typeof this.config.batchSize !== "undefined") {
            batchSize = this.config.batchSize === 0 ? nms.length : this.config.batchSize;
        }
        while (count < nms.length) {
            const parBatch = [];
            const limit = count + batchSize;
            for (let i = count; (i < limit) && (i < nms.length); i++) {
                parBatch.push(nms[i]);
                count++;
            }
            serRuns.push(parBatch);
        }
        return serRuns;
    }
    getStreamers(options) {
        const _super = Object.create(null, {
            getStreamers: { get: () => super.getStreamers }
        });
        return __awaiter(this, void 0, void 0, function* () {
            if (!_super.getStreamers.call(this)) {
                return [];
            }
            const nms = [];
            for (const streamer of this.streamerList.values()) {
                nms.push(streamer.nm);
            }
            const serRuns = this.serialize(nms);
            try {
                let streamers = [];
                for (let i = 0; i < serRuns.length; i++) {
                    const batch = yield this.checkBatch(serRuns[i], options);
                    streamers = streamers.concat(batch);
                }
                return streamers;
            }
            catch (err) {
                this.errMsg(err.toString());
                return [];
            }
        });
    }
    setupCapture(streamer, url) {
        if (!super.setupCapture(streamer.uid)) {
            return { spawnArgs: "", filename: "", streamer: "" };
        }
        const filename = this.getFileName(streamer.nm);
        const newurl = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.nm : url;
        const spawnArgs = this.getCaptureArguments(newurl, filename);
        return { spawnArgs: spawnArgs, filename: filename, streamer: streamer };
    }
}
exports.Plugin = Basic;
//# sourceMappingURL=basic.js.map