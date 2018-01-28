const Promise      = require("bluebird");
const colors       = require("colors/safe");
const childProcess = require("child_process");
const site         = require("./site");

class Mixer extends site.Site {
    constructor(config, tui) {
        super("MIXER", config, "_mixer", tui);

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            const nm = this.siteConfig.streamers[i];
            this.streamerList.set(nm, {uid: nm, nm: nm, state: "Offline", filename: "", captureProcess: null});
        }
    }

    updateList(nm, add, isTemp) {
        return Promise.try(() => super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        let msg = colors.name(nm);

        return Promise.try(() => {
            const url = childProcess.execSync("youtube-dl -g https://mixer.com/" + nm, {stdio : ["pipe", "pipe", "ignore"]});

            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;

            let isStreaming = 0;

            if (typeof url === "undefined" || url === null) {
                msg += " is offline.";
                streamer.state = "Offline";
            } else {
                msg += " is streaming.";
                this.streamersToCap.push({uid: nm, nm: nm});
                isStreaming = 1;
                streamer.state = "Streaming";
            }

            super.checkStreamerState(streamer, msg, isStreaming, prevState);

            this.render();
            return true;
        }).catch(() => {
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;
            streamer.state = "Offline";

            msg += " is offline.";

            super.checkStreamerState(streamer, msg, 0, prevState);

            this.render();
            return false;
        });
    }

    getStreamers(bundle) {
        if (!super.getStreamers(bundle)) {
            return Promise.try(() => []);
        }

        const queries = [];
        this.streamersToCap = [];

        this.streamerList.forEach((value) => {
            queries.push(this.checkStreamerState(value.nm));
        });

        return Promise.all(queries).then(() => this.streamersToCap);
    }

    setupCapture(streamer) {
        if (!super.setupCapture(streamer.uid)) {
            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return Promise.try(() => empty);
        }

        return Promise.try(() => {
            const filename = this.getFileName(streamer.nm);
            let url = childProcess.execSync("youtube-dl -g https://mixer.com/" + streamer.nm, {stdio : ["pipe", "pipe", "ignore"]});

            url = url.toString();
            url = url.replace(/\r?\n|\r/g, "");

            const spawnArgs = this.getCaptureArguments(url, filename);

            return {spawnArgs: spawnArgs, filename: filename, streamer: streamer};
        }).catch(() => {
            const msg = colors.name(streamer.nm) + " is offline.";
            const item = this.streamerList.get(streamer.nm);
            const prevState = item.state;

            item.state = "Offline";

            super.checkStreamerState(item, msg, 0, prevState);
            this.render();

            const empty = {spawnArgs: "", filename: "", streamer: ""};
            return empty;
        });
    }
}

exports.Mixer = Mixer;

