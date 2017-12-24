const Promise      = require("bluebird");
const colors       = require("colors/safe");
const fetch        = require("node-fetch");
const _            = require("underscore");
const fs           = require("fs");
const yaml         = require("js-yaml");
const childProcess = require("child_process");
const site         = require("./site");

class Twitch extends site.Site {
    constructor(config, screen, logbody, inst, total) {
        super("TWITCH", config, "_twitch", screen, logbody, inst, total);
    }

    processUpdates() {
        const stats = fs.statSync("updates.yml");
        if (!stats.isFile()) {
            return {includeStreamers: [], excludeStreamers: [], dirty: false};
        }

        let includeStreamers = [];
        let excludeStreamers = [];

        const updates = yaml.safeLoad(fs.readFileSync("updates.yml", "utf8"));

        if (!updates.includeTwitch) {
            updates.includeTwitch = [];
        } else if (updates.includeTwitch.length > 0) {
            this.msg(updates.includeTwitch.length + " streamer(s) to include");
            includeStreamers = updates.includeTwitch;
            updates.includeTwitch = [];
        }

        if (!updates.excludeTwitch) {
            updates.excludeTwitch = [];
        } else if (updates.excludeTwitch.length > 0) {
            this.msg(updates.excludeTwitch.length + " streamer(s) to exclude");
            excludeStreamers = updates.excludeTwitch;
            updates.excludeTwitch = [];
        }

        // if there were some updates, then rewrite updates.yml
        if (includeStreamers.length > 0 || excludeStreamers.length > 0) {
            fs.writeFileSync("updates.yml", yaml.safeDump(updates), "utf8");
        }

        return {includeStreamers: includeStreamers, excludeStreamers: excludeStreamers, dirty: false};
    }

    updateList(nm, add) {
        let rc = false;
        if (super.updateList({nm: nm, uid: nm}, this.config.twitch, add)) {
            if (add) {
                this.config.twitch.push(nm);
                rc = true;
            } else if (this.config.twitch.indexOf(nm) !== -1) {
                this.config.twitch = _.without(this.config.twitch, nm);
                rc = true;
            }
        }
        return rc;
    }

    checkStreamerState(nm) {
        const url = "https://api.twitch.tv/kraken/streams/" + nm + "?client_id=rznf9ecq10bbcwe91n6hhnul3dbpg9";
        const me = this;

        return Promise.try(function() {
            return fetch(url);
        }).then((res) => res.json()).then(function(json) {
            const listitem = me.streamerList.get(nm);
            let isBroadcasting = 0;
            let msg = colors.name(nm);

            if (typeof json.stream === "undefined" || json.stream === null) {
                msg += " is offline.";
                listitem.streamerState = "Offline";
            } else {
                msg += " is live streaming";
                me.streamersToCap.push({uid: nm, nm: nm});
                isBroadcasting = 1;
                listitem.streamerState = "Streaming";
            }

            me.streamerState.set(nm, listitem.streamerState);
            me.streamerList.set(nm, listitem);
            if ((!me.streamerState.has(nm) && listitem.streamerState !== "Offline") || (me.streamerState.has(nm) && listitem.streamerState !== me.streamerState.get(nm))) {
                me.msg(msg);
            }
            me.streamerState.set(nm, listitem.streamerState);

            if (me.currentlyCapping.has(nm) && isBroadcasting === 0) {
                me.dbgMsg(colors.name(nm) + " is no longer broadcasting, ending ffmpeg process.");
                me.haltCapture(nm);
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
        for (let i = 0; i < this.config.twitch.length; i++) {
            if (!this.streamerList.has(this.config.twitch[i])) {
                this.streamerList.set(this.config.twitch[i], {uid: this.config.twitch[i], nm: this.config.twitch[i], streamerState: "Offline", filename: ""});
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
            let url = childProcess.execSync("youtube-dl -g https://twitch.tv/" + streamer.nm);

            url = url.toString();
            url = url.replace(/\r?\n|\r/g, "");

            const spawnArgs = me.getCaptureArguments(url, filename);

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

exports.Twitch = Twitch;

