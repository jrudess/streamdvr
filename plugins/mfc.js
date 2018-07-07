const Promise = require("bluebird");
const mfc     = require("MFCAuto");
const site    = require("../core/site");
const _       = require("underscore");
const colors  = require("colors/safe");

class Mfc extends site.Site {
    constructor(tui) {
        super("MFC", tui);
        if (typeof this.siteConfig.mfcautolog !== "undefined" && this.siteConfig.mfcautolog === false) {
            mfc.setLogLevel(0);
        }
        this.mfcGuest = new mfc.Client("guest", "guest", {useWebSockets: this.siteConfig.mfcWebSocket, modernLogin: this.siteConfig.modernLogin, camYou: false});
    }

    connect() {
        return Promise.try(() => this.mfcGuest.connectAndWaitForModels()).catch((err) => {
            this.errMsg(err.toString());
        });
    }

    disconnect() {
        this.mfcGuest.disconnect();
    }

    updateList(nm, add, isTemp) {
        // Fetch the UID. The streamer does not have to be online for this.
        if (this.mfcGuest.state === mfc.ClientState.ACTIVE) {
            this.mfcGuest.queryUser(nm).then((streamer) => {
                if (super.updateList(streamer, add, isTemp)) {
                    super.writeConfig();
                }
            });
        }
        return false;
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
        if (this.mfcGuest.state !== mfc.ClientState.ACTIVE) {
            return Promise.try(() => false);
        }

        return Promise.try(() => this.mfcGuest.queryUser(uid)).then((model) => {
            if (typeof model === "undefined" || typeof model.uid === "undefined") {
                return false;
            }

            let isStreaming = 0;
            let msg = colors.name(model.nm);

            if (!this.streamerList.has(uid)) {
                this.streamerList.set(uid, {uid: uid, nm: model.nm, site: this.padName, state: "Offline", filename: "", captureProcess: null, postProcess: 0});
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
                if (msg.charAt(msg.length - 6) === "s") {
                    msg += colors.name("'");
                } else {
                    msg += colors.name("'s");
                }
                msg += " stream is off.";
            } else if (bestSession.vs === mfc.STATE.Offline) {
                streamer.state = "Offline";
                msg += " has logged off.";
            }

            super.checkStreamerState(streamer, msg, isStreaming, prevState);

            if (isStreaming) {
                const capInfo = this.setupCapture(streamer);
                if (capInfo && capInfo.spawnArgs && capInfo.spawnArgs !== "") {
                    this.startCapture(capInfo.streamer, capInfo.filename, capInfo.spawnArgs);
                }
            }

            return true;
        }).catch((err) => {
            this.errMsg(err.toString());
            return false;
        });
    }

    getStreamers(bundle) {
        if (!super.getStreamers(bundle)) {
            return Promise.try(() => []);
        }

        const queries = [];

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            queries.push(this.checkStreamerState(this.siteConfig.streamers[i]));
        }

        // Only add a streamer from temp list if they are not
        // in the primary list.  Prevents duplicate recording.
        for (let i = 0; i < this.tempList.length; i++) {
            if (!_.contains(this.siteConfig.streamers, this.tempList[i])) {
                queries.push(this.checkStreamerState(this.tempList[i]));
            }
        }

        return Promise.all(queries);
    }

    setupCapture(model) {
        if (!super.setupCapture(model.uid)) {
            return {spawnArgs: "", filename: "", streamer: ""};
        }

        const filename = this.getFileName(model.nm);
        const mod = mfc.Model.getModel(model.uid);
        let url = this.mfcGuest.getHlsUrl(mod);
        if (this.tui.config.streamlink) {
            url = "hlssession://" + url;
        }
        const spawnArgs = this.getCaptureArguments(url, filename);

        return {spawnArgs: spawnArgs, filename: filename, streamer: model};
    }
}

exports.Mfc = Mfc;

