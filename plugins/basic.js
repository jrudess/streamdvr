"use strict";

const {promisify} = require("util");
const exec        = promisify(require("child_process").exec);
const {Site}      = require("../core/site");

// A basic-site is one in which external scripts are used to check if a
// streamer is online and also record the streams.  These scripts currently
// wrap youtube-dl, streamlink, and ffmpeg functionality.  This allows for
// easier support of new programs by adding new shell script wrappers.
class Basic extends Site {
    constructor(siteName, dvr, tui, urlback) {
        super(siteName, dvr, tui);

        this.urlback = urlback;

        if (this.config.streamers.length > 0) {
            if (this.config.streamers[0].constructor !== Array) {
                this.infoMsg("Streamer list is old style format, performing one-time conversion");
                this.convertFormat(this.config.streamers);
            }
        }

        for (let i = 0; i < this.config.streamers.length; i++) {
            // for (const nm of this.config.streamers.values()) {
            const nm = this.config.streamers[i][0];
            const paused = this.config.streamers[i][1] === "paused";
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
                paused:       paused
            });
        }
        this.redrawList = true;
    }

    async convertFormat(streamerList) {
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

    updateList(nm, options) {
        return super.updateList({nm: nm, uid: nm}, options);
    }

    createListItem(id) {
        const listItem = [];
        listItem.push(id.nm);
        listItem.push("unpaused");
        return listItem;
    }

    async m3u8Script(nm) {
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

        this.dbgMsg(nm.name + " running: " + cmd.cmd);
        try {
            // m3u8 url in stdout
            const stdio = await exec(cmd, {stdio : ["pipe", "pipe", "ignore"]});
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

    async checkStreamerState(nm, options) {
        // Detect if streamer is online or actively streaming
        const streamer  = this.streamerList.get(nm);
        const prevState = streamer.state;
        const stream    = await this.m3u8Script(nm);

        let msg = nm.name;
        if (stream.status) {
            msg += " is streaming.";
            streamer.state = "Streaming";
        } else {
            msg += " is offline.";
            streamer.state = "Offline";
        }

        super.checkStreamerState(streamer, msg, stream.status, prevState);

        if (stream.status) {
            if (streamer.paused) {
                this.dbgMsg(streamer.nm.name + " is paused, recording not started.");
            } else if (!options || !options.init) {
                this.startCapture(this.setupCapture(streamer, stream.m3u8));
            }
        }
    }

    async checkBatch(batch, options) {
        const queries = [];

        for (let i = 0; i < batch.length; i++) {
            queries.push(this.checkStreamerState(batch[i], options));
        }

        try {
            await Promise.all(queries);
            return true;
        } catch (err) {
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
            }
            serRuns.push(parBatch);
        }
        return serRuns;
    }

    async getStreamers(options) {
        if (!super.getStreamers()) {
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
                const batch = await this.checkBatch(serRuns[i], options);
                streamers = streamers.concat(batch);
            }
            return streamers;
        } catch (err) {
            this.errMsg(err.toString());
            return [];
        }
    }

    setupCapture(streamer, url) {
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

