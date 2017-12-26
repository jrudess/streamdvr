const Promise = require("bluebird");
const colors  = require("colors/safe");
const fetch   = require("node-fetch");
const site    = require("./site");

function promiseSerial(funcs) {
    return funcs.reduce((promise, func) => promise.then((result) => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));
}

class Cb extends site.Site {
    constructor(config, screen, logbody, inst, total) {
        super("CB    ", config, "_cb", screen, logbody, inst, total);
        this.cbData = new Map();
        this.timeOut = 20000;
    }

    updateList(nm, add, isTemp) {
        return Promise.try(() =>  super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        const url = "https://chaturbate.com/api/chatvideocontext/" + nm;
        let msg = colors.name(nm);
        let isBroadcasting = 0;

        return Promise.try(() => fetch(url, {timeout: this.timeOut})).then((res) => res.json()).then((json) => {
            const listitem = this.streamerList.get(nm);

            if (typeof json.status !== "undefined") {
                if (json.detail === "This room requires a password.") {
                    listitem.streamerState = "Password Protected";
                } else if (json.detail === "Room is deleted.") {
                    listitem.streamerState = "Deleted";
                } else {
                    listitem.streamerState = "Access Denied";
                }
                this.streamerState.set(nm, listitem.streamerState);
                this.streamerList.set(nm, listitem);
                msg += ", " + json.detail;
                this.dbgMsg(msg);
            } else {
                const currState = json.room_status;
                this.cbData.set(nm, json);
                if (currState === "public") {
                    msg += " is in public chat!";
                    this.streamersToCap.push({uid: nm, nm: nm});
                    isBroadcasting = 1;
                    listitem.streamerState = "Public Chat";
                } else if (currState === "private") {
                    msg += " is in a private show.";
                    listitem.streamerState = "Private";
                } else if (currState === "group") {
                    msg += " is in a group show.";
                    listitem.streamerState = "Group Show";
                } else if (currState === "away") {
                    msg += colors.name("'s") + " stream is off.";
                    listitem.streamerState = "Away";
                } else if (currState === "hidden") {
                    msg += " is online but hidden.";
                    listitem.streamerState = "Hidden";
                } else if (currState === "offline") {
                    msg += " has gone offline.";
                    listitem.streamerState = "Offline";
                } else {
                    msg += " has unknown state: " + currState;
                    listitem.streamerState = currState;
                }

                super.checkStreamerState({nm: nm, uid: nm}, listitem, msg, isBroadcasting, currState === "offline", currState);

            }
            this.render();
            return true;
        }).catch((err) => {
            this.errMsg("Unknown streamer " + colors.name(nm) + ", check the spelling.");
            this.streamerList.delete(nm);
            this.render();
            return err;
        });
    }

    checkStreamersState(batch) {
        const me = this;
        const queries = [];

        for (let i = 0; i < batch.length; i++) {
            queries.push(this.checkStreamerState(batch[i]));
        }

        return Promise.all(queries).then(() => true).catch((err) => {
            me.errMsg(err.toString());
        });
    }

    getStreamersToCap() {
        this.streamersToCap = [];

        // TODO: This should be somewhere else
        for (let i = 0; i < this.listConfig.streamers.length; i++) {
            const nm = this.listConfig.streamers[i];
            if (!this.streamerList.has(nm)) {
                this.streamerList.set(nm, {uid: nm, nm: nm, streamerState: "Offline", filename: ""});
            }
        }
        for (let i = 0; i < this.tempList.length; i++) {
            const nm = this.tempList[i];
            if (!this.streamerList.has(nm)) {
                this.streamerList.set(nm, {uid: nm, nm: nm, streamerState: "Offline", filename: ""});
            }
        }

        this.render();

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
            const batchSize = this.listConfig.batchSizeCB === 0 ? nms.length : count + this.listConfig.batchSizeCB;

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

        if (!super.setupCapture(streamer)) {
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

