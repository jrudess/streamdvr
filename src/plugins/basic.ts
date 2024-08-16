"use strict";

import {Site, Id, Streamer, CapInfo, StreamerStateOptions} from "../core/site";
import {Dvr, MSG} from "../core/dvr";
import {Tui} from "../core/tui";

const colors = require("colors");
const spawn = require("await-spawn");

// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap yt-dlp, streamlink, and ffmpeg.
class Basic extends Site {

    protected urlback: string;

    public constructor(siteName: string, dvr: Dvr, tui: Tui, urlback: string) {
        super(siteName, dvr, tui);
        this.urlback = urlback;
    }

    protected createListItem(id: Id): Array<string> {
        const prefix = id.uid !== id.nm ? id.uid + "," : "";
        return [prefix + id.nm, "unpaused"];
    }

    public override start(): void {
        super.start();

        for (const entry of this.config.streamers) {
            const nm: string = entry[0];
            const tokens = nm.split(/,/);
            if (!this.streamerList.has(tokens[0])) {
                const streamer: Streamer = {
                    uid: tokens[0],
                    nm: tokens.length > 1 ? tokens[1] : tokens[0],
                    site: this.padName,
                    state: "Offline",
                    filename: "",
                    capture: undefined,
                    postProcess: false,
                    filesize: 0,
                    stuckcounter: 0,
                    paused: entry[this.pauseIndex] === "paused",
                    isTemp: false,
                };
                this.streamerList.set(tokens[0], streamer);
            }
        }
        this.redrawList = true;
    }

    public async connect() {
        this.redrawList = true;
        return true;
    }

    public async disconnect() {
        return true;
    }

    protected async m3u8Script(uid: string, nm: string) {
        const streamerUrl: string = this.config.siteUrl + uid + this.urlback;
        const script: string      = this.dvr.calcPath(this.config.m3u8fetch);
        let args: Array<string>   = ["-s", streamerUrl];

        if (this.dvr.config.proxy.enable) {
            args.push("-P");
            args.push(this.dvr.config.proxy.server);
        }

        if (this.config.username) {
            args.push("-u");
            args.push(`--${this.listName}-username=${this.config.username}`);
        }

        if (this.config.password) {
            args.push("-p");
            args.push(`--${this.listName}-password=${this.config.password}`);
        }

        if (this.config.m3u8fetch_args) {
            args = args.concat(this.config.m3u8fetch_args);
        }

        this.print(MSG.DEBUG, `${colors.name(nm)} running: ${colors.cmd(script + " " + args.join(" "))}`);

        // m3u8 url in stdout
        try {
            const url = await spawn(script, args, {stdio: ["pipe", "pipe", "ignore"]});
            const urlStr: string = url.toString().replace(/\r?\n|\r/g, "");
            return {status: urlStr === "" ? false : true, m3u8: urlStr};
        } catch (err: any) {
            this.print(MSG.ERROR, "m3u8 try fail");
            if (err.stdout) {
                this.print(MSG.ERROR, err.stdout.toString());
            }
            if (err.stderr) {
                this.print(MSG.ERROR, err.stderr.toString());
            }
        }

        return {status: false, m3u8: ""};
    }

    protected override async checkStreamerState(streamer: Streamer) {
        // Detect if streamer is online or actively streaming
        const stream = await this.m3u8Script(streamer.uid, streamer.nm);
        const options: StreamerStateOptions = {
            msg: "",
            isStreaming: stream.status,
            prevState: streamer.state,
            m3u8: stream.m3u8,
        };
        streamer.state = stream.status ? "Streaming" : "Offline";
        options.msg    = `${colors.name(streamer.nm)} is ${streamer.state}`;
        await super.checkStreamerState(streamer, options);
    }

    protected async checkBatch(batch: Array<Id>) {
        try {
            const queries = [];
            for (const item of batch) {
                const streamer: Streamer | undefined = this.streamerList.get(item.uid);
                if (streamer) {
                    queries.push(this.checkStreamerState(streamer));
                }
            }

            await Promise.all(queries);
            return true;
        } catch (err: any) {
            this.print(MSG.ERROR, err.toString());
            return false;
        }
    }

    protected serialize(ids: Array<Id>): Array<Array<Id>> {
        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.  Set batchSize to 0 for full parallel, or 1 for full serial.
        const serRuns: Array<Array<Id>> = [];
        let count = 0;
        let batchSize = 5;
        if (typeof this.config.batchSize !== "undefined") {
            batchSize = this.config.batchSize === 0 ? ids.length : this.config.batchSize;
        }

        while (count < ids.length) {
            const parBatch: Array<Id> = [];
            const limit = count + batchSize;

            for (let i = count; (i < limit) && (i < ids.length); i++) {
                parBatch.push(ids[i]);
                count++;
            }
            serRuns.push(parBatch);
        }
        return serRuns;
    }

    public override async getStreamers() {
        const ret: boolean = await super.getStreamers();
        if (!ret) {
            return false;
        }

        const ids: Array<Id> = [];
        for (const streamer of this.streamerList.values()) {
            ids.push({uid: streamer.uid, nm: streamer.nm});
        }

        const serRuns: Array<Array<Id>> = this.serialize(ids);

        try {
            for (const item of serRuns) {
                await this.checkBatch(item);
            }
            return true;
        } catch (err: any) {
            this.print(MSG.ERROR, err.toString());
            return false;
        }
    }

    protected setupCapture(streamer: Streamer, url: string): CapInfo {
        const newurl: string = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.uid : url;

        const filename: string = this.getFileName(streamer.nm);
        const capInfo: CapInfo = {
            site: this,
            streamer: streamer,
            filename: filename,
            spawnArgs: this.getCaptureArguments(newurl, filename),
        };
        return capInfo;
    }
}

exports.Plugin = Basic;
