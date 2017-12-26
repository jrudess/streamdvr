const Promise      = require("bluebird");
const colors       = require("colors/safe");
const fetch        = require("node-fetch");
const childProcess = require("child_process");
const site         = require("./site");

class Twitch extends site.Site {
    constructor(config, screen, logbody, inst, total) {
        super("TWITCH", config, "_twitch", screen, logbody, inst, total);
    }

    updateList(nm, add, isTemp) {
        return Promise.try(() => super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        const url = "https://api.twitch.tv/kraken/streams/" + nm + "?client_id=rznf9ecq10bbcwe91n6hhnul3dbpg9";

        return Promise.try(() => fetch(url)).then((res) => res.json()).then((json) => {
            const listitem = this.streamerList.get(nm);
            let isBroadcasting = 0;
            let msg = colors.name(nm);

            if (typeof json.stream === "undefined" || json.stream === null) {
                msg += " is offline.";
                listitem.streamerState = "Offline";
            } else {
                msg += " is live streaming";
                this.streamersToCap.push({uid: nm, nm: nm});
                isBroadcasting = 1;
                listitem.streamerState = "Streaming";
            }

            this.streamerState.set(nm, listitem.streamerState);
            super.checkStreamerState({nm: nm, uid: nm}, listitem, msg, isBroadcasting, listitem.streamerState === "offline", listitem.streamerState);

            this.render();
            return true;
        }).catch((err) => {
            this.errMsg("Unknown streamer " + colors.name(nm) + ", check the spelling.");
            this.streamerList.delete(nm);
            this.render();
            return err;
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

        const queries = [];

        this.streamerList.forEach((value) => {
            queries.push(this.checkStreamerState(value.nm));
        });

        return Promise.all(queries).then(() => this.streamersToCap);
    }

    setupCapture(streamer) {

        if (!super.setupCapture(streamer)) {
            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return Promise.try(() => empty);
        }

        return Promise.try(() => {
            const filename = this.getFileName(streamer.nm);
            let url = childProcess.execSync("youtube-dl -g https://twitch.tv/" + streamer.nm);

            url = url.toString();
            url = url.replace(/\r?\n|\r/g, "");

            const spawnArgs = this.getCaptureArguments(url, filename);

            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        });
    }
}

exports.Twitch = Twitch;

