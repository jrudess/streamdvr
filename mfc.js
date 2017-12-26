const Promise = require("bluebird");
const mfc     = require("MFCAuto");
const site    = require("./site");
const _       = require("underscore");
const colors  = require("colors/safe");

class Mfc extends site.Site {
    constructor(config, screen, logbody, inst, total) {
        super("MFC   ", config, "_mfc", screen, logbody, inst, total);
        mfc.setLogLevel(0);
        this.mfcGuest = new mfc.Client("guest", "guest", {useWebSockets: this.listConfig.mfcWebsocket, camYou: false});
    }

    connect() {
        return Promise.try(() => this.mfcGuest.connectAndWaitForModels()).catch((err) => {
            this.errMsg(err.toString());
            return err;
        });
    }

    disconnect() {
        this.mfcGuest.disconnect();
    }

    queryUser(nm) {
        return this.mfcGuest.queryUser(nm);
    }

    updateList(nm, add, isTemp) {
        // Fetch the UID. The streamer does not have to be online for this.
        return this.queryUser(nm).then((streamer) => super.updateList(streamer, add, isTemp));
    }

    updateStreamers(bundle, add) {
        const queries = [];
        const list = add ? bundle.includeStreamers : bundle.excludeStreamers;

        for (let i = 0; i < list.length; i++) {
            this.dbgMsg("Checking if " + colors.name(list[i]) + " exists.");
            queries.push(this.updateList(list[i], add, false).then((dirty) => {
                bundle.dirty |= dirty;
            }));
        }

        return Promise.all(queries).then(() => bundle);
    }

    checkStreamerState(uid) {

        return Promise.try(() => this.mfcGuest.queryUser(uid)).then((streamer) => {
            if (typeof streamer === "undefined") {
                return true;
            }

            let isBroadcasting = 0;
            let msg = colors.name(streamer.nm);

            if (!this.streamerList.has(streamer.nm)) {
                this.streamerList.set(streamer.nm, {uid: uid, nm: streamer.nm, streamerState: "Offline", filename: ""});
            }

            const listitem = this.streamerList.get(streamer.nm);

            if (streamer.vs === mfc.STATE.FreeChat) {
                listitem.streamerState = "Public Chat";
                msg += " is in public chat!";
                this.streamersToCap.push(streamer);
                isBroadcasting = 1;
            } else if (streamer.vs === mfc.STATE.GroupShow) {
                listitem.streamerState = "Group Show";
                msg += " is in a group show";
            } else if (streamer.vs === mfc.STATE.Private) {
                if (streamer.truepvt === 1) {
                    listitem.streamerState = "True Private";
                    msg += " is in a true private show.";
                } else {
                    listitem.streamerState = "Private";
                    msg += " is in a private show.";
                }
            } else if (streamer.vs === mfc.STATE.Away) {
                listitem.streamerState = "Away";
                msg += " is away.";
            } else if (streamer.vs === mfc.STATE.Online) {
                listitem.streamerState = "Away";
                msg += colors.name("'s") + " stream is off.";
            } else if (streamer.vs === mfc.STATE.Offline) {
                listitem.streamerState = "Offline";
                msg += " has logged off.";
            }

            super.checkStreamerState(streamer, listitem, msg, isBroadcasting, streamer.vs === mfc.STATE.Offline, streamer.vs);

            this.render();
            return true;
        }).catch((err) => {
            this.errMsg(err.toString());
            return err;
        });
    }

    getStreamersToCap() {
        const queries = [];

        this.streamersToCap = [];

        for (let i = 0; i < this.listConfig.streamers.length; i++) {
            queries.push(this.checkStreamerState(this.listConfig.streamers[i]));
        }

        // Only add a streamer from temp list if they are not
        // in the primary list.  Prevents duplicate recording.
        for (let i = 0; i < this.tempList.length; i++) {
            if (!_.contains(this.listConfig.streamers, this.tempList[i])) {
                queries.push(this.checkStreamerState(this.tempList[i]));
            }
        }

        return Promise.all(queries).then(() => this.streamersToCap);
    }

    setupCapture(streamer) {

        if (!super.setupCapture(streamer)) {
            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return Promise.try(() => empty);
        }

        return Promise.try(() => {
            const filename = this.getFileName(streamer.nm);
            const url = "http://video" + (streamer.u.camserv - 500) + ".myfreecams.com:1935/NxServer/ngrp:mfc_" + (100000000 + streamer.uid) + ".f4v_mobile/playlist.m3u8";
            const spawnArgs = this.getCaptureArguments(url, filename);

            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        }).catch((err) => {
            this.errMsg(colors.name(streamer.nm) + " " + err.toString());
            return err;
        });
    }
}

exports.Mfc = Mfc;

