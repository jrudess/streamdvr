"use strict";

const colors      = require("colors");
const {promisify} = require("util");
const exec        = promisify(require("child_process").exec);
const {Site}      = require("../core/site");

// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap youtube-dl, streamlink, and ffmpeg.
class Basic extends Site {
    constructor(siteName: string, dvr: any, tui: any, urlback: string) {
        super(siteName, dvr, tui);

        this.urlback = urlback;

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
                postProcess:  0,
                filsesize:    0,
                stuckcounter: 0,
                paused:       paused,
            });
        }
        this.redrawList = true;
    }

    protected async convertFormat(streamerList: Array<any>) {
        const newList = [];
        for (const streamer of streamerList.values()) {
            const newItem = [];
            newItem.push(streamer);   // name
            newItem.push("unpaused");
            newList.push(newItem);
        }
        this.config.streamers = newList;
        await this.writeConfig();
    }

    protected updateList(nm: string, options: any) {
        return super.updateList({nm: nm, uid: nm}, options);
    }

    protected createListItem(id: any) {
        const listItem = [];
        listItem.push(id.nm);
        listItem.push("unpaused");
        return listItem;
    }

    public togglePause(streamer: any, options: any) {
        if (streamer) {
            for (const item of this.config.streamers) {
                if (item[0] === streamer.uid) {
                    if (item[1] === "paused") {
                        this.infoMsg(streamer.nm.name + " is unpaused.");
                        item[1] = "unpaused";
                        streamer.paused = false;
                        this.refresh(streamer, options);
                    } else {
                        this.infoMsg(streamer.nm.name + " is paused.");
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

    protected async m3u8Script(nm: string) {
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
        try {
            // m3u8 url in stdout
            const stdio = await exec(cmd, {stdio: ["pipe", "pipe", "ignore"]});
            let url = stdio.stdout.toString();
            url = url.replace(/\r?\n|\r/g, "");

            return {status: true, m3u8: url};
        } catch (stdio) {
            if (stdio.stdout) {
                this.errMsg(stdio.stdout);
            }
            if (stdio.stderr) {
                this.errMsg(stdio.stderr);
            }
            return {status: false, m3u8: ""};
        }
    }

    protected async checkStreamerState(streamer: any, options: any) {
        // Detect if streamer is online or actively streaming
        const prevState = streamer.state;
        const stream    = await this.m3u8Script(streamer.nm);

        let msg = colors.name(streamer.nm);
        if (stream.status) {
            msg += " is streaming.";
            streamer.state = "Streaming";
        } else {
            msg += " is offline.";
            streamer.state = "Offline";
        }

        let newoptions: any = {};
        if (options) {
            newoptions = options;
        }
        newoptions.msg = msg;
        newoptions.isStreaming = stream.status;
        newoptions.prevState = prevState;
        super.checkStreamerState(streamer, newoptions);

        if (stream.status) {
            if (streamer.paused) {
                this.dbgMsg(streamer.nm.name + " is paused, recording not started.");
            } else if (!options || !options.init) {
                this.startCapture(this.setupCapture(streamer, stream.m3u8));
            }
        }
    }

    protected async checkBatch(batch: any, options: any) {
        const queries = [];

        for (const item of batch) {
            const streamer: any = this.streamerList.get(item);
            queries.push(this.checkStreamerState(streamer, options));
        }

        try {
            await Promise.all(queries);
            return true;
        } catch (err) {
            this.errMsg(err.toString());
            return false;
        }
    }

    protected serialize(nms: any) {
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

    protected async getStreamers(options: any) {
        if (!super.getStreamers()) {
            return [];
        }

        const nms = [];
        for (const streamer of this.streamerList.values()) {
            nms.push(streamer.nm);
        }

        const serRuns = this.serialize(nms);

        try {
            let streamers: Array<any> = [];
            for (const item of serRuns) {
                const batch = await this.checkBatch(item, options);
                streamers = streamers.concat(batch);
            }
            return streamers;
        } catch (err) {
            this.errMsg(err.toString());
            return [];
        }
    }

    protected setupCapture(streamer: any, url: any) {
        if (!super.setupCapture(streamer.uid)) {
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        const filename  = this.getFileName(streamer.nm);
        const newurl    = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.nm : url;
        const spawnArgs = this.getCaptureArguments(newurl, filename);
        return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
    }
}

exports.Plugin = Basic;
