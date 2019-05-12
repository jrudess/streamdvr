"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const site_1 = require("../core/site");
const child_process_1 = require("child_process");
const colors = require("colors");
// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap youtube-dl, streamlink, and ffmpeg.
class Basic extends site_1.Site {
    constructor(siteName, dvr, tui, urlback) {
        super(siteName, dvr, tui);
        this.urlback = urlback;
    }
    convertFormat(streamerList) {
        const newList = [];
        for (const streamer of streamerList.values()) {
            newList.push([streamer, "unpaused"]);
        }
        this.config.streamers = newList;
        this.writeConfig();
    }
    createListItem(id) {
        return [id.nm, "unpaused"];
    }
    start() {
        if (this.config.streamers.length > 0) {
            if (this.config.streamers[0].constructor !== Array) {
                this.infoMsg("Upgrading " + this.cfgFile + " to new format, this is a one-time conversion.");
                this.convertFormat(this.config.streamers);
            }
        }
        for (const entry of this.config.streamers) {
            this.dbgMsg("start(): entry[0] " + entry[0] + "; entry[1] = " + entry[1]);
            const nm = entry[0];
            if (!this.streamerList.has(nm)) {
                const streamer = {
                    uid: nm,
                    nm: nm,
                    site: this.padName,
                    state: "Offline",
                    filename: "",
                    capture: null,
                    postProcess: false,
                    filesize: 0,
                    stuckcounter: 0,
                    paused: entry[this.pauseIndex] === "paused",
                    isTemp: false,
                };
                this.streamerList.set(nm, streamer);
                this.dbgMsg("start(): Adding " + nm);
            }
        }
        this.redrawList = true;
    }
    async connect() {
        return true;
    }
    async disconnect() {
        return true;
    }
    m3u8Script(nm) {
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
        this.dbgMsg(`${colors.name(nm)}` + " running: " + `${colors.cmd(cmd)}`);
        // m3u8 url in stdout
        try {
            const stdout = child_process_1.execSync(cmd, { stdio: ["pipe", "pipe", "ignore"] });
            let url = stdout.toString();
            if (url) {
                url = url.replace(/\r?\n|\r/g, "");
                return { status: true, m3u8: url };
            }
        }
        catch (err) {
            if (err.stdout) {
                this.errMsg(err.stdout.toString());
            }
        }
        return { status: false, m3u8: "" };
    }
    checkStreamerState(streamer) {
        // Detect if streamer is online or actively streaming
        const stream = this.m3u8Script(streamer.nm);
        const options = site_1.StreamerStateDefaults;
        options.prevState = streamer.state;
        options.isStreaming = stream.status;
        streamer.state = stream.status ? "Streaming" : "Offline";
        options.msg = `${colors.name(streamer.nm)}` + " is " + streamer.state;
        super.checkStreamerState(streamer, options);
    }
    async checkBatch(batch) {
        const queries = [];
        for (const item of batch) {
            const streamer = this.streamerList.get(item);
            this.dbgMsg("checkBatch: nm = " + item);
            if (streamer) {
                this.dbgMsg("checkBatch: streamer.nm = " + streamer.nm);
                queries.push(this.checkStreamerState(streamer));
            }
        }
        try {
            await Promise.all(queries);
            return true;
        }
        catch (err) {
            this.errMsg(err.toString());
            return false;
        }
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
                this.dbgMsg("serialize: count =  " + count + "; nms[" + i + "] = " + nms[i]);
            }
            serRuns.push(parBatch);
        }
        return serRuns;
    }
    async getStreamers() {
        if (!super.getStreamers()) {
            return false;
        }
        const nms = [];
        for (const streamer of this.streamerList.values()) {
            this.dbgMsg("getStreamers(): streamer.uid = " + streamer.uid + "; streamer.nm = " + streamer.nm);
            nms.push(streamer.nm);
        }
        const serRuns = this.serialize(nms);
        try {
            for (const item of serRuns) {
                await this.checkBatch(item);
            }
            return true;
        }
        catch (err) {
            this.errMsg(err.toString());
            return false;
        }
    }
    setupCapture(streamer, url) {
        const capInfo = site_1.CapInfoDefaults;
        const newurl = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.nm : url;
        capInfo.site = this;
        capInfo.streamer = streamer;
        capInfo.filename = this.getFileName(streamer.nm);
        capInfo.spawnArgs = this.getCaptureArguments(newurl, capInfo.filename);
        return capInfo;
    }
}
exports.Plugin = Basic;
//# sourceMappingURL=basic.js.map