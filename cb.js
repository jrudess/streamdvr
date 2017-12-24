const Promise = require("bluebird");
const colors  = require("colors/safe");
const fetch   = require("node-fetch");
const _       = require("underscore");
const fs      = require("fs");
const yaml    = require("js-yaml");
const site    = require("./site");

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
        if (super.updateList({nm: nm, uid: nm}, this.config.cb, add)) {
            if (add) {
                this.config.cb.push(nm);
                return true;
            } else if (this.config.cb.indexOf(nm) !== -1) {
                this.config.cb = _.without(this.config.cb, nm);
                return true;
            }
        }
        return false;
    }

    checkStreamerState(nm) {
        const url = "https://chaturbate.com/api/chatvideocontext/" + nm;
        const me = this;
        let msg = colors.name(nm);
        let isBroadcasting = 0;

        return Promise.try(function() {
            return fetch(url, {timeout: me.timeOut});
        }).then((res) => res.json()).then(function(json) {
            const listitem = me.streamerList.get(nm);

            if (typeof json.status !== "undefined") {
                if (json.detail === "This room requires a password.") {
                    listitem.streamerState = "Password Protected";
                } else if (json.detail === "Room is deleted.") {
                    listitem.streamerState = "Deleted";
                } else {
                    listitem.streamerState = "Access Denied";
                }
                me.streamerState.set(nm, listitem.streamerState);
                me.streamerList.set(nm, listitem);
                msg += ", " + json.detail;
                me.dbgMsg(msg);
            } else {
                const currState = json.room_status;
                me.cbData.set(nm, json);
                if (currState === "public") {
                    msg += " is in public chat!";
                    me.streamersToCap.push({uid: nm, nm: nm});
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
                me.streamerList.set(nm, listitem);
                if ((!me.streamerState.has(nm) && currState !== "offline") || (me.streamerState.has(nm) && currState !== me.streamerState.get(nm))) {
                    me.msg(msg);
                }
                me.streamerState.set(nm, currState);

                if (me.currentlyCapping.has(nm) && isBroadcasting === 0) {
                    me.dbgMsg(colors.name(nm) + " is no longer broadcasting, ending ffmpeg process.");
                    me.haltCapture(nm);
                }
            }
            me.render();
            return true;
        }).catch(function(err) {
            me.errMsg("Unknown streamer " + colors.name(nm) + ", check the spelling.");
            me.streamerList.delete(nm);
            me.render();
            return err;
        });
    }

    getStreamersToCap() {
        const me = this;

        this.streamersToCap = [];

        // TODO: This should be somewhere else
        for (let i = 0; i < this.config.cb.length; i++) {
            if (!this.streamerList.has(this.config.cb[i])) {
                this.streamerList.set(this.config.cb[i], {uid: this.config.cb[i], nm: this.config.cb[i], streamerState: "Offline", filename: ""});
            }
        }
        this.render();

        const queries = [];

        me.streamerList.forEach(function(value) {
            queries.push(me.checkStreamerState(value.nm));
        });

        return Promise.all(queries).then(function() {
            return me.streamersToCap;
        });
    }

    setupCapture(streamer, tryingToExit) {
        const me = this;

        if (!super.setupCapture(streamer, tryingToExit)) {
            return Promise.try(function() {
                return {spawnArgs: "", filename: "", streamer: ""};
            });
        }

        return Promise.try(function() {
            const filename = me.getFileName(streamer.nm);
            const data = me.cbData.get(streamer.nm);
            const url = data.hls_source;
            let spawnArgs = me.getCaptureArguments(url, filename);

            if (url === "") {
                me.msg(colors.name(streamer.nm) + " is not actually online, CB is not updating properly.");
                spawnArgs = "";
            }
            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        });
    }

    recordStreamers(streamersToCap, tryingToExit) {
        if (streamersToCap === null || streamersToCap.length === 0) {
            return null;
        }

        const caps = [];
        const me = this;

        this.dbgMsg(streamersToCap.length + " streamer(s) to capture");
        for (let i = 0; i < streamersToCap.length; i++) {
            const cap = this.setupCapture(streamersToCap[i], tryingToExit).then(function(bundle) {
                if (bundle.spawnArgs !== "") {
                    me.startCapture(bundle.spawnArgs, bundle.filename, bundle.streamer, tryingToExit);
                }
            });
            caps.push(cap);
        }
        return Promise.all(caps);
    }
}

exports.Cb = Cb;

