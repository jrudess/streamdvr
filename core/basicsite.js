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
        return Promise.try(() => super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        let stdout = null;
        let stderr = null;
        let msg = colors.name(nm);

        this.dbgMsg(colors.name(nm) + " checking online status");

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
                let isStreaming = 0;

                if (typeof stdout === "undefined" || stdout === null || stdout === "") {
                    msg += " is offline.";
                    streamer.state = "Offline";
                } else {
                    msg += " is streaming.";
                    this.streamersToCap.push({uid: nm, nm: nm});
                    isStreaming = 1;
                    streamer.state = "Streaming";
                }

                super.checkStreamerState(streamer, msg, isStreaming, prevState);

                return true;
            });
        }).catch(() => {
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;
            streamer.state = "Offline";

            msg += " is offline.";

            // Don't print errors for normal offline cases
            if (typeof stdout !== "undefined" && stdout !== null && stdout !== "") {
                if (stdout.search("No playable streams found on this URL") === -1) {
                    this.errMsg(colors.name(nm) + " " + stdout.toString());
                }
            } else if (typeof stderr !== "undefined" && stderr !== null && stderr !== "") {
                if (stderr.search("is offline") === -1) {
                    this.errMsg(colors.name(nm) + " " + stderr.toString());
                }
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

    getStreamers(bundle) {
        if (!super.getStreamers(bundle)) {
            return Promise.try(() => []);
        }

        this.streamersToCap = [];

        const nms = [];
        this.streamerList.forEach((value) => {
            nms.push(value.nm);
        });

        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.
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
        return promiseSerial(funcs).then(() => this.streamersToCap).catch((err) => {
            this.errMsg(err.toString());
            return [];
        });
    }

    setupCapture(streamer) {
        if (!super.setupCapture(streamer.uid)) {
            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return Promise.try(() => empty);
        }

        return Promise.try(() => {
            // Get the m3u8 URL
            const filename = this.getFileName(streamer.nm);
            let url;
            if (this.noHLS) {
                url = this.siteUrl + streamer.nm;
            } else {
                url = childProcess.execSync(this.cmdfront + this.siteUrl + streamer.nm + " " + this.cmdback, {stdio : ["pipe", "pipe", "ignore"]});
                url = url.toString();
                url = url.replace(/\r?\n|\r/g, "");

                if (this.tui.config.streamlink) {
                    url = "hlssession://" + url;
                }
            }

            const spawnArgs = this.getCaptureArguments(url, filename);

            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        }).catch(() => {
            const msg = colors.name(streamer.nm) + " is offline.";
            const item = this.streamerList.get(streamer.nm);
            const prevState = item.state;
            item.state = "Offline";

            super.checkStreamerState(item, msg, 0, prevState);

            return {spawnArgs: "", filename: "", streamer: ""};
        });
    }
}

exports.Basicsite = Basicsite;

