const Promise      = require("bluebird");
const colors       = require("colors/safe");
const childProcess = require("child_process");
const site         = require("./site");

class Basicsite extends site.Site {
    constructor(siteName, config, siteDir, tui, siteUrl, noHLS, cmdfront, cmdback) {
        super(siteName, config, siteDir, tui);

        this.siteUrl  = siteUrl;
        this.cmdfront = cmdfront;
        this.cmdback  = cmdback;
        this.noHLS    = noHLS;

        for (let i = 0; i < this.siteConfig.streamers.length; i++) {
            const nm = this.siteConfig.streamers[i];
            this.streamerList.set(nm, {uid: nm, nm: nm, site: this.padName, state: "Offline", filename: "", captureProcess: null, postProcess: 0});
        }
    }

    updateList(nm, add, isTemp) {
        return Promise.try(() => super.updateList({nm: nm, uid: nm}, add, isTemp));
    }

    checkStreamerState(nm) {
        let msg = colors.name(nm);

        return Promise.try(() => {
            // Detect if streamer is online or actively streaming
            const url = childProcess.execSync(this.cmdfront + this.siteUrl + nm + this.cmdback, {stdio : ["pipe", "pipe", "ignore"]});
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;

            let isStreaming = 0;

            if (typeof url === "undefined" || url === null || url === "error: The broadcaster is currently not available") {
                msg += " is offline.";
                streamer.state = "Offline";
            } else {
                msg += " is streaming.";
                this.streamersToCap.push({uid: nm, nm: nm});
                isStreaming = 1;
                streamer.state = "Streaming";
            }

            super.checkStreamerState(streamer, msg, isStreaming, prevState);

            this.tui.render();
            return true;
        }).catch(() => {
            const streamer = this.streamerList.get(nm);
            const prevState = streamer.state;
            streamer.state = "Offline";

            msg += " is offline.";

            super.checkStreamerState(streamer, msg, 0, prevState);

            this.tui.render();
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
            // Get the m3u8 URL
            const filename = this.getFileName(streamer.nm);
            let url;
            if (this.noHLS) {
                url = this.siteUrl + streamer.nm;
            } else {
                url = childProcess.execSync(this.cmdfront + this.siteUrl + streamer.nm + this.cmdback, {stdio : ["pipe", "pipe", "ignore"]});
                if (this.config.streamlink) {
                    url = "hlssession://" + url;
                }
            }

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
            this.tui.render();

            return {spawnArgs: "", filename: "", streamer: ""};
        });
    }
}

exports.Basicsite = Basicsite;

