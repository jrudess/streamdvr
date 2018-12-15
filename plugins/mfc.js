"use strict";

const mfc    = require("MFCAuto");
const {Site} = require("../core/site");
const _      = require("underscore");
const colors = require("colors/safe");

class Mfc extends Site {
    constructor(name, dvr, tui, urlback) {
        super(name, dvr, tui);
        this.urlback = urlback;
        if (typeof this.siteConfig.mfcautolog !== "undefined" && this.siteConfig.mfcautolog === false) {
            mfc.setLogLevel(0);
        }
        this.mfcGuest = new mfc.Client("guest", "guest", {
            useWebSockets: this.siteConfig.mfcWebSocket,
            modernLogin:   this.siteConfig.modernLogin,
            camYou:        false
        });

        this.dirty = false;
    }

    async connect() {
        try {
            await this.mfcGuest.connectAndWaitForModels();
        } catch (err) {
            this.errMsg(err.toString());
        }
    }

    async disconnect() {
        try {
            await this.mfcGuest.disconnect();
        } catch (err) {
            this.errMsg(err.toString());
        }
    }

    async updateList(nm, options) {
        // Fetch the UID. The streamer does not have to be online for this.
        if (this.mfcGuest.state === mfc.ClientState.ACTIVE) {
            try {
                const id = await this.mfcGuest.queryUser(nm);
                if (id) {
                    if (super.updateList(id, options)) {
                        this.dirty = true;
                        return true;
                    }
                } else {
                    this.errMsg(colors.name(nm) + " does not exist on this site");
                }
            } catch (err) {
                this.errMsg(err.toString());
            }
        }
        return false;
    }

    async updateStreamers(list, options) {
        this.dirty = false;
        const queries = list.map((x) => this.updateList(x, {add: options.add, pause: 0, isTemp: false, init: options.init}));
        try {
            await Promise.all(queries);
        } catch (err) {
            this.errMsg(err.toString());
        }
        return this.dirty;
    }

    async checkStreamerState(uid, options) {
        if (this.mfcGuest.state !== mfc.ClientState.ACTIVE) {
            return false;
        }

        let model;
        try {
            model = await this.mfcGuest.queryUser(uid);
        } catch (err) {
            this.errMsg(err.toString());
            return false;
        }

        if (typeof model === "undefined" || typeof model.uid === "undefined") {
            return false;
        }

        let isStreaming = 0;
        let msg = colors.name(model.nm);

        if (!this.streamerList.has(uid)) {
            this.streamerList.set(uid, {uid: uid, nm: model.nm, site: this.padName, state: "Offline", filename: "", captureProcess: null, postProcess: 0});
            this.streamerListDamaged = true;
        }

        const streamer = this.streamerList.get(uid);
        const prevState = streamer.state;

        const bestSession = mfc.Model.getModel(model.uid).bestSession;

        if (bestSession.vs === mfc.STATE.FreeChat) {
            streamer.state = "Public Chat";
            msg += " is in public chat!";
            isStreaming = 1;
        } else if (bestSession.vs === mfc.STATE.GroupShow) {
            streamer.state = "Group Show";
            msg += " is in a group show";
        } else if (bestSession.vs === mfc.STATE.Private) {
            if (bestSession.truepvt === 1) {
                streamer.state = "True Private";
                msg += " is in a true private show.";
            } else {
                streamer.state = "Private";
                msg += " is in a private show.";
            }
        } else if (bestSession.vs === mfc.STATE.Away) {
            streamer.state = "Away";
            msg += " is away.";
        } else if (bestSession.vs === mfc.STATE.Online) {
            streamer.state = "Away";
            // Check the last character but avoid color codes
            msg += msg.charAt(msg.length - 6) === "s" ? colors.name("'") : colors.name("'s");
            msg += " stream is off.";
        } else if (bestSession.vs === mfc.STATE.Offline) {
            streamer.state = "Offline";
            msg += " has logged off.";
        }

        super.checkStreamerState(streamer, msg, isStreaming, prevState);

        if (streamer.paused) {
            this.dbgMsg(colors.name(streamer.nm) + " is paused, recording not started.");
        } else if (isStreaming) {
            if (!options || !options.init) {
                this.startCapture(this.setupCapture(streamer));
            }
        }

        return true;
    }

    async getStreamers(options) {
        if (!super.getStreamers()) {
            return;
        }

        const queries = [];

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            queries.push(this.checkStreamerState(this.siteConfig.streamers[i], options));
        }

        // Only add a streamer from temp list if they are not
        // in the primary list.  Prevents duplicate recording.
        for (let i = 0; i < this.tempList.length; i++) {
            if (!_.contains(this.siteConfig.streamers, this.tempList[i])) {
                queries.push(this.checkStreamerState(this.tempList[i], options));
            }
        }

        try {
            await Promise.all(queries);
        } catch (err) {
            this.errMsg(err.toString());
        }
    }

    setupCapture(model) {
        if (!super.setupCapture(model.uid)) {
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        const filename = this.getFileName(model.nm);
        const mod = mfc.Model.getModel(model.uid);
        if (mod.camserv < 840) {
            this.infoMsg(colors.name(model.nm) + " does not have a mobile feed and can not be captured");
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        const url = this.mfcGuest.getHlsUrl(mod);

        // MFC is upscaling streams to 1280x960 wasting bandwidth
        // These mappings work around it to select the true resolution
        const params = [];
        if (this.siteConfig.recorder === "scripts/record_streamlink.sh") {
            params.push("--stream-sorting-excludes");
            params.push("960p,5564k,live");
        } else if (url.indexOf("==") === -1) {
            // Skip adding these params for 16:9 streams by checking for
            // base64 key chars in those streams
            params.push("-map");
            params.push("0:1");
            params.push("-map");
            params.push("0:2");
        }

        const spawnArgs = this.getCaptureArguments(url, filename, {params: params});

        return {spawnArgs: spawnArgs, filename: filename, streamer: model};
    }
}

exports.Plugin = Mfc;

