const Promise = require("bluebird");
const colors  = require("colors/safe");
const fetch   = require("node-fetch");
const _       = require("underscore");
const fs      = require("fs");
const yaml    = require("js-yaml");
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

    processUpdates() {
        const stats = fs.statSync("updates.yml");
        if (!stats.isFile()) {
            this.dbgMsg("updates.yml does not exist");
            return {includeStreamers: [], excludeStreamers: [], dirty: false};
        }

        let includeStreamers = [];
        let excludeStreamers = [];

        const updates = yaml.safeLoad(fs.readFileSync("updates.yml", "utf8"));

        if (!updates.includeCb) {
            updates.includeCb = [];
        } else if (updates.includeCb.length > 0) {
            this.msg(updates.includeCb.length + " streamer(s) to include");
            includeStreamers = updates.includeCb;
            updates.includeCb = [];
        }

        if (!updates.excludeCb) {
            updates.excludeCb = [];
        } else if (updates.excludeCb.length > 0) {
            this.msg(updates.excludeCb.length + " streamer(s) to exclude");
            excludeStreamers = updates.excludeCb;
            updates.excludeCb = [];
        }

        // if there were some updates, then rewrite updates.yml
        if (includeStreamers.length > 0 || excludeStreamers.length > 0) {
            fs.writeFileSync("updates.yml", yaml.safeDump(updates), "utf8");
        }

        return {includeStreamers: includeStreamers, excludeStreamers: excludeStreamers, dirty: false};
    }

    updateList(nm, add) {
        let update = false;
        if (super.updateList({nm: nm, uid: nm}, this.config.cb, add)) {
            if (add) {
                this.config.cb.push(nm);
                update = true;
            } else if (this.config.cb.indexOf(nm) !== -1) {
                this.config.cb = _.without(this.config.cb, nm);
                update = true;
            }
        }

        return Promise.try(() => update);
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
                this.streamerList.set(nm, listitem);
                if ((!this.streamerState.has(nm) && currState !== "offline") || (this.streamerState.has(nm) && currState !== this.streamerState.get(nm))) {
                    this.msg(msg);
                }
                this.streamerState.set(nm, currState);

                if (this.currentlyCapping.has(nm) && isBroadcasting === 0) {
                    this.dbgMsg(colors.name(nm) + " is no longer broadcasting, ending ffmpeg process.");
                    this.haltCapture(nm);
                }
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
        for (let i = 0; i < this.config.cb.length; i++) {
            if (!this.streamerList.has(this.config.cb[i])) {
                this.streamerList.set(this.config.cb[i], {uid: this.config.cb[i], nm: this.config.cb[i], streamerState: "Offline", filename: ""});
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
            const batchSize = this.config.batchSizeCB === 0 ? nms.length : count + this.config.batchSizeCB;

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

    recordStreamers(streamersToCap) {
        if (streamersToCap === null || streamersToCap.length === 0) {
            return null;
        }

        const caps = [];

        this.dbgMsg(streamersToCap.length + " streamer(s) to capture");
        for (let i = 0; i < streamersToCap.length; i++) {
            const cap = this.setupCapture(streamersToCap[i]).then((bundle) => {
                if (bundle.spawnArgs !== "") {
                    this.startCapture(bundle.spawnArgs, bundle.filename, bundle.streamer);
                }
            });
            caps.push(cap);
        }
        return Promise.all(caps);
    }
}

exports.Cb = Cb;

