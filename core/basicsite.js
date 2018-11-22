const colors      = require("colors/safe");
const {promisify} = require("util");
const exec        = promisify(require("child_process").exec);
const {Site}      = require("./site");

class Basicsite extends Site {
    constructor(siteName, tui, cmdfront, cmdback) {
        super(siteName, tui);

        this.cmdfront = cmdfront;
        this.cmdback  = cmdback;

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            const nm = this.siteConfig.streamers[i];
            this.streamerList.set(nm, {uid: nm, nm: nm, site: this.padName, state: "Offline", filename: "", captureProcess: null, postProcess: 0});
        }
    }

    updateList(nm, add, isTemp) {
        return super.updateList({nm: nm, uid: nm}, add, isTemp);
    }

    async checkStreamerState(nm) {
        let stdio = null;
        let msg = colors.name(nm);

        // this.dbgMsg(colors.name(nm) + " checking online status");

        // Detect if streamer is online or actively streaming
        const streamer = this.streamerList.get(nm);
        const prevState = streamer.state;

        let mycmd = this.cmdfront + this.siteConfig.siteUrl + nm + " " + this.cmdback;
        this.dbgMsg(colors.name(nm) + " running: " + colors.site(mycmd));

        if (this.tui.config.proxyenable) {
            if (this.siteType === "streamlink") {
                mycmd += " --https-proxy " + this.tui.config.proxyserver;
            } else if (this.siteType === "youtubedl") {
                mycmd += " --proxy " + this.tui.config.proxyserver;
            }
        }

        try {
            stdio = await exec(mycmd, {stdio : ["pipe", "pipe", "ignore"]});
        } catch (err) {
            let stdoutprint = false;
            let stderrprint = false;

            if (err && err.stdout) {
                stdoutprint = (err.stdout.search("No playable streams found on this URL") === -1) &&
                              (err.stdout.search("Forbidden for url") === -1);
            }

            if (err && err.stderr) {
                stderrprint = (err.stderr.search("is offline") === -1) &&
                              (err.stderr.search("Unable to open URL") === -1) &&
                              (err.stderr.search("could not be found") === -1);
            }

            // Don't print errors for normal offline cases
            if (stdoutprint || (stderrprint && err.stdout)) {
                this.errMsg(colors.name(nm) + " " + err.stdout.toString());
            }
        }

        // let url;
        let isStreaming = false;
        if (stdio && stdio.stdout) {
            isStreaming = true;
        }

        if (isStreaming) {
            msg += " is streaming.";
            streamer.state = "Streaming";

            // url = stdio.stdout.toString();
            // url = url.replace(/\r?\n|\r/g, "");
        } else {
            msg += " is offline.";
            streamer.state = "Offline";
        }

        super.checkStreamerState(streamer, msg, isStreaming, prevState);

        if (isStreaming) {
            this.startCapture(this.setupCapture(streamer));
        }

        return true;
    }

    async checkBatch(batch) {
        const queries = [];

        for (let i = 0; i < batch.length; i++) {
            queries.push(this.checkStreamerState(batch[i]));
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
        if (this.siteConfig.batchSize) {
            batchSize = this.siteConfig.batchSize === 0 ? nms.length : this.siteConfig.batchSize;
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

    async getStreamers() {
        if (!super.getStreamers()) {
            return [];
        }

        const nms = [];
        this.streamerList.forEach((value) => {
            nms.push(value.nm);
        });

        const serRuns = this.serialize(nms);

        try {
            let streamers = [];
            for (let i = 0; i < serRuns.length; i++) {
                const batch = await this.checkBatch(serRuns[i]);
                streamers = streamers.concat(batch);
            }
            return streamers;
        } catch (err) {
            this.errMsg(err.toString());
            return [];
        }
    }

    setupCapture(streamer) {
        if (!super.setupCapture(streamer.uid)) {
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        const filename  = this.getFileName(streamer.nm);
        const url       = this.siteConfig.siteUrl + streamer.nm;
        const spawnArgs = this.getCaptureArguments(url, filename);
        return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
    }
}

exports.Basicsite = Basicsite;

