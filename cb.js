const Promise = require("bluebird");
const colors  = require("colors/safe");
const fetch   = require("node-fetch");
const site    = require("./site");

function promiseSerial(funcs) {
    return funcs.reduce((promise, func) => promise.then((result) => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));
}

class Cb extends site.Site {
    constructor(config, tui) {
        super("CB", config, "_cb", tui);
        this.cbData = new Map();
        this.timeOut = 20000;

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            const nm = this.siteConfig.streamers[i];
            this.streamerList.set(nm, {uid: nm, nm: nm, state: "Offline", filename: "", captureProcess: null});
        }
    }

    updateList(nm, add, isTemp) {
        return Promise.try(() => super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        const url = "https://chaturbate.com/api/chatvideocontext/" + nm;
        let msg = colors.name(nm);
        let isStreaming = 0;

        return Promise.try(() => fetch(url, {timeout: this.timeOut})).then((res) => res.json()).then((json) => {
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;

            if (typeof json.status !== "undefined") {
                if (json.detail === "This room requires a password.") {
                    streamer.state = "Password Protected";
                } else if (json.detail === "Room is deleted.") {
                    streamer.state = "Deleted";
                } else {
                    streamer.state = "Access Denied";
                }
                this.streamerList.set(nm, streamer);
                msg += ", " + json.detail;
                this.dbgMsg(msg);
            } else {
                const currState = json.room_status;
                this.cbData.set(nm, json);
                if (currState === "public") {
                    msg += " is in public chat!";
                    this.streamersToCap.push({uid: nm, nm: nm});
                    isStreaming = 1;
                    streamer.state = "Public Chat";
                } else if (currState === "private") {
                    msg += " is in a private show.";
                    streamer.state = "Private";
                } else if (currState === "group") {
                    msg += " is in a group show.";
                    streamer.state = "Group Show";
                } else if (currState === "away") {
                    msg += colors.name("'s") + " stream is off.";
                    streamer.state = "Away";
                } else if (currState === "hidden") {
                    msg += " is online but hidden.";
                    streamer.state = "Hidden";
                } else if (currState === "offline") {
                    msg += " has gone offline.";
                    streamer.state = "Offline";
                } else {
                    msg += " has unknown state: " + currState;
                    streamer.state = currState;
                }

                super.checkStreamerState(streamer, msg, isStreaming, prevState);
            }
            this.render();
            return true;
        }).catch((err) => {
            this.errMsg(colors.name(nm), " lookup problem: " + err.toString());
            return false;
        });
    }

    checkStreamersState(batch) {
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

        // Break the CB list up into batches - this throttles
        // the total number of simultaneous URL fetches to CB
        // and also helps limit spikes in CPU usage.
        const serRuns = [];
        let count = 0;

        while (count < nms.length) {
            const parBatch = [];
            const batchSize = this.siteConfig.batchSizeCB === 0 ? nms.length : count + this.siteConfig.batchSizeCB;

            for (let i = count; (i < batchSize) && (i < nms.length); i++) {
                parBatch.push(nms[i]);
                count++;
            }
            serRuns.push(parBatch);
        }

        const funcs = serRuns.map((batch) => () => this.checkStreamersState(batch));
        return promiseSerial(funcs).then(() => this.streamersToCap).catch((err) => {
            this.errMsg(err.toString());
        });
    }

    setupCapture(streamer) {
        if (!super.setupCapture(streamer.uid)) {
            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return Promise.try(() => empty);
        }

        return Promise.try(() => {
            const filename = this.getFileName(streamer.nm);
            const data = this.cbData.get(streamer.nm);
            const url = data.hls_source;
            let spawnArgs = this.getCaptureArguments(url, filename);

            if (url === "") {
                this.msg(colors.name(streamer.nm) + " is not actually online, CB is not updating properly.");
                spawnArgs = "";
            }
            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        });
    }
}

exports.Cb = Cb;

