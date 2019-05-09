"use strict";

// import {promisify} from "util";
import {Site, Streamer, Id, CapInfo, StreamerStateOptions, StreamerStateDefaults} from "../core/site";
import {execSync} from "child_process";

const colors = require("colors");
// const exec   = promisify(require("child_process").exec);

// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap youtube-dl, streamlink, and ffmpeg.
class Basic extends Site {

    protected urlback: string;

    constructor(siteName: string, dvr: any, tui: any, urlback: string) {
        super(siteName, dvr, tui);

        this.urlback = urlback;

    }

    protected convertFormat(streamerList: Array<any>) {
        const newList = [];
        for (const streamer of streamerList.values()) {
            const newItem = [];
            newItem.push(streamer);   // name
            newItem.push("unpaused");
            newList.push(newItem);
        }
        this.config.streamers = newList;
        this.writeConfig();
    }

    protected createListItem(id: Id): Array<string> {
        const listItem: Array<string> = [];
        listItem.push(id.nm);
        listItem.push("unpaused");
        return listItem;
    }

    public togglePause(streamer: Streamer | undefined): boolean {
        if (streamer) {
            for (const item of this.config.streamers) {
                if (item[0] === streamer.uid) {
                    if (streamer.paused) {
                        this.infoMsg(colors.name(streamer.nm) + " is unpaused.");
                        item[1] = "unpaused";
                        streamer.paused = false;
                        // this.refresh(streamer, options);
                        this.refresh(streamer);
                    } else {
                        this.infoMsg(colors.name(streamer.nm) + " is paused");
                        item[1] = "paused";
                        streamer.paused = true;
                        this.haltCapture(streamer.uid);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    public async connect() {
        if (this.config.streamers.length > 0) {
            if (this.config.streamers[0].constructor !== Array) {
                this.infoMsg("Upgrading " + this.cfgFile + " to new format, this is a one-time conversion.");
                this.convertFormat(this.config.streamers);
            }
        }

        for (const streamer of this.config.streamers) {
            const nm = streamer[0];
            const paused = streamer[1] === "paused";
            this.streamerList.set(nm, {
                uid:          nm,
                nm:           nm,
                site:         this.padName,
                state:        "Offline",
                filename:     "",
                capture:      null,
                postProcess:  false,
                filesize:     0,
                stuckcounter: 0,
                paused:       paused,
                isTemp:       false,
            });
        }
        this.redrawList = true;
        return true;
    }

    public async disconnect() {
        return true;
    }

    protected m3u8Script(nm: string) {
        const streamerUrl = this.config.siteUrl + nm + this.urlback;
        const script      = this.dvr.calcPath(this.config.m3u8fetch);
        let cmd           = script + " -s " + streamerUrl;

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

        // m3u8 url in stdout
        try {
            const stdout = execSync(cmd, {stdio: ["pipe", "pipe", "ignore"]});
            let url = stdout.toString();
            if (url) {
                url = url.replace(/\r?\n|\r/g, "");
                return {status: true, m3u8: url};
            }
        } catch (err) {
            if (err.stdio) {
                this.errMsg(err.stdio.toString());
            }
        }

        return {status: false, m3u8: ""};
    }

    protected checkStreamerState(streamer: Streamer) {
        // Detect if streamer is online or actively streaming
        const stream = this.m3u8Script(streamer.nm);

        const prevState = streamer.state;
        let msg = colors.name(streamer.nm);
        if (stream.status) {
            msg += " is streaming.";
            streamer.state = "Streaming";
        } else {
            msg += " is offline.";
            streamer.state = "Offline";
        }

        const options: StreamerStateOptions = StreamerStateDefaults;
        options.msg = msg;
        options.isStreaming = stream.status;
        options.prevState = prevState;
        super.checkStreamerState(streamer, options);

        if (stream.status) {
            if (streamer.paused) {
                this.dbgMsg(colors.name(streamer.nm) + " is paused, recording not started.");
            } else if (!options || !options.init) {
                this.startCapture(this.setupCapture(streamer, stream.m3u8));
            }
        }
    }

    protected async checkBatch(batch: Array<string>) {
        const queries = [];

        for (const item of batch) {
            const streamer: Streamer | undefined = this.streamerList.get(item);
            if (streamer) {
                queries.push(this.checkStreamerState(streamer));
            }
        }

        try {
            await Promise.all(queries);
            return true;
        } catch (err) {
            this.errMsg(err.toString());
            return false;
        }
    }

    protected serialize(nms: Array<string>) {
        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.  Set batchSize to 0 for full parallel, or 1 for full serial.
        const serRuns: Array<Array<string>> = [];
        let count = 0;
        let batchSize = 5;
        if (typeof this.config.batchSize !== "undefined") {
            batchSize = this.config.batchSize === 0 ? nms.length : this.config.batchSize;
        }

        while (count < nms.length) {
            const parBatch: Array<string> = [];
            const limit = count + batchSize;

            for (let i = count; (i < limit) && (i < nms.length); i++) {
                parBatch.push(nms[i]);
                count++;
            }
            serRuns.push(parBatch);
        }
        return serRuns;
    }

    public async getStreamers() {
        if (!super.getStreamers()) {
            return false;
        }

        const nms: Array<string> = [];
        for (const streamer of this.streamerList.values()) {
            nms.push(streamer.nm);
        }

        const serRuns: Array<Array<string>> = this.serialize(nms);

        try {
            for (const item of serRuns) {
                await this.checkBatch(item);
            }
            return true;
        } catch (err) {
            this.errMsg(err.toString());
            return false;
        }
    }

    protected setupCapture(streamer: Streamer, url: string): CapInfo {
        if (!this.canStartCap(streamer.uid)) {
            return {site: this, streamer: null, filename: "", spawnArgs: []};
        }

        const filename: string         = this.getFileName(streamer.nm);
        const newurl: string           = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.nm : url;
        const spawnArgs: Array<string> = this.getCaptureArguments(newurl, filename);
        return {site: this, streamer: streamer, filename: filename, spawnArgs: spawnArgs};
    }
}

exports.Plugin = Basic;
