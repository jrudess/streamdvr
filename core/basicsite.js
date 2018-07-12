const Promise      = require("bluebird");
const colors       = require("colors/safe");
const childProcess = require("child_process");
const site         = require("./site");

function promiseSerial(funcs) {
    return funcs.reduce((promise, func) => promise.then((result) => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));
}

function childToPromise(child) {
    return new Promise((resolve, reject) => {
        child.addListener("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error("Non-zero exit code " + code));
            }
        });
    });
}

class Basicsite extends site.Site {
    constructor(siteName, tui, siteUrl, noHLS, cmdfront, cmdback) {
        super(siteName, tui);

        this.siteUrl  = siteUrl;
        this.cmdfront = cmdfront;
        this.cmdback  = cmdback;
        this.noHLS    = noHLS;

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            const nm = this.siteConfig.streamers[i];
            this.streamerList.set(nm, {uid: nm, nm: nm, site: this.padName, state: "Offline", filename: "", captureProcess: null, postProcess: 0});
        }
    }

    updateList(nm, add, isTemp) {
        return super.updateList({nm: nm, uid: nm}, add, isTemp);
    }

    checkStreamerState(nm) {
        let stdout = null;
        let stderr = null;
        let msg = colors.name(nm);

        // this.dbgMsg(colors.name(nm) + " checking online status");

        return Promise.try(() => {
            // Detect if streamer is online or actively streaming
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;

            let mycmd = this.cmdfront + this.siteUrl + nm + " " + this.cmdback;

            if (typeof this.tui.config.proxyenable !== "undefined" && this.tui.config.proxyenable) {
                if (this.siteType === "streamlink") {
                    mycmd = mycmd + " --https-proxy " + this.tui.config.proxyserver;
                } else if (this.siteType === "youtubedl") {
                    mycmd = mycmd + " --proxy " + this.tui.config.proxyserver;
                }
            }

            const child = childProcess.exec(mycmd, {stdio : ["pipe", "pipe", "ignore"]});
            child.stdout.on("data", (data) => {
                stdout = data;
            });
            child.stderr.on("data", (data) => {
                stderr = data;
            });

            return childToPromise(child).then(() => {
                const isStreaming = typeof stdout !== "undefined" && stdout !== null && stdout !== "";
                let url;

                if (isStreaming) {
                    msg += " is streaming.";
                    streamer.state = "Streaming";

                    url = stdout.toString();
                    url = url.replace(/\r?\n|\r/g, "");
                } else {
                    msg += " is offline.";
                    streamer.state = "Offline";
                }

                super.checkStreamerState(streamer, msg, isStreaming, prevState);

                if (isStreaming) {
                    this.startCapture(this.setupCapture(streamer, url));
                }

                return true;
            });
        }).catch(() => {
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;
            let stdoutprint = typeof stdout !== "undefined" && stdout !== null && stdout !== "";
            let stderrprint = typeof stderr !== "undefined" && stderr !== null && stderr !== "";

            streamer.state = "Offline";
            msg += " is offline.";

            if (stdoutprint) {
                stdoutprint = (stdout.search("No playable streams found on this URL") === -1) &&
                              (stdout.search("Forbidden for url") === -1);
            }

            if (stderrprint) {
                stderrprint = (stderr.search("is offline") === -1) &&
                              (stderr.search("Unable to open URL") === -1) &&
                              (stderr.search("could not be found") === -1);
            }

            // Don't print errors for normal offline cases
            if (stdoutprint || (stderrprint && stdout !== null)) {
                this.errMsg(colors.name(nm) + " " + stdout.toString());
            }

            super.checkStreamerState(streamer, msg, 0, prevState);

            return false;
        });
    }

    checkBatch(batch) {
        const queries = [];

        for (let i = 0; i < batch.length; i++) {
            queries.push(this.checkStreamerState(batch[i]));
        }

        return Promise.all(queries).then(() => true).catch((err) => {
            this.errMsg(err.toString());
            return false;
        });
    }

    getStreamers() {
        if (!super.getStreamers()) {
            return Promise.resolve([]);
        }

        const nms = [];
        this.streamerList.forEach((value) => {
            nms.push(value.nm);
        });

        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.  Set batchSize to 0 for full paralell, or 1 for full serial.
        const serRuns = [];
        let count = 0;
        let batchSize = 5;
        if (typeof this.siteConfig.batchSize !== "undefined") {
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

        const funcs = serRuns.map((batch) => () => this.checkBatch(batch));
        return promiseSerial(funcs).catch((err) => {
            this.errMsg(err.toString());
            return [];
        });
    }

    setupCapture(streamer, url) {
        if (!super.setupCapture(streamer.uid)) {
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        // Build URL for recorder
        const filename = this.getFileName(streamer.nm);
        let newurl = url;
        if (this.noHLS) {
            newurl = this.siteUrl + streamer.nm;
        } else if (this.tui.config.streamlink) {
            newurl = "hlssession://" + url;
        }

        const spawnArgs = this.getCaptureArguments(newurl, filename);

        return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
    }
}

exports.Basicsite = Basicsite;

