"use strict";

import {Site, Id, Streamer, CapInfo, StreamerStateOptions} from "../core/site";
import {Dvr, MSG} from "../core/dvr";
import {Tui} from "../core/tui";
import {execSync} from "child_process";

const colors = require("colors");

// Basic-site uses external scripts/programs to find m3u8 URLs and to record
// streams.  The scripts currently wrap youtube-dl, streamlink, and ffmpeg.
class Basic extends Site {

    protected urlback: string;

    public constructor(siteName: string, dvr: Dvr, tui: Tui, urlback: string) {
        super(siteName, dvr, tui);
        this.urlback = urlback;
    }

    protected createListItem(id: Id): Array<string> {
        if (id.uid !== id.nm) {
            return [id.uid + "," + id.nm, "unpaused"];
        } else {
            return [id.nm, "unpaused"];
        }
    }

    public start(): void {
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

    public async connect(): Promise<boolean> {
        this.redrawList = true;
        this.print(MSG.DEBUG, "Site connected");
        return true;
    }

    public async disconnect(): Promise<boolean> {
        this.print(MSG.DEBUG, "Site disconnected");
        return true;
    }

    protected m3u8Script(uid: string, nm: string) {
        const streamerUrl = this.config.siteUrl + uid + this.urlback;
        const script      = this.dvr.calcPath(this.config.m3u8fetch);
        let cmd           = `${script} -s ${streamerUrl}`;

        if (this.dvr.config.proxy.enable) {
            cmd = `${cmd} -p ${this.dvr.config.proxy.server}`;
        }

        if (this.config.username) {
            cmd = `${cmd} -u --${this.listName}-username=${this.config.username}`;
        }

        if (this.config.password) {
            cmd = `${cmd} -p --${this.listName}-password=${this.config.password}`;
        }

        if (this.config.m3u8fetch_args) {
            for (let arg of this.config.m3u8fetch_args) {
                cmd = cmd + " " + arg;
            }
        }

        this.print(MSG.DEBUG, `${colors.name(nm)} running: ${colors.cmd(cmd)}`);

        // m3u8 url in stdout
        try {
            const stdout = execSync(cmd, {stdio: ["pipe", "pipe", "ignore"]});
            let url = stdout.toString();
            if (url) {
                url = url.replace(/\r?\n|\r/g, "");
                return {status: true, m3u8: url};
            }
        } catch (err) {
            if (err.stdout) {
                this.print(MSG.ERROR, err.stdout.toString());
            }
        }

        return {status: false, m3u8: ""};
    }

    protected checkStreamerState(streamer: Streamer): void {
        // Detect if streamer is online or actively streaming
        const stream = this.m3u8Script(streamer.uid, streamer.nm);
        const options: StreamerStateOptions = {
            msg: "",
            isStreaming: stream.status,
            prevState: streamer.state,
            m3u8: stream.m3u8,
        };
        streamer.state = stream.status ? "Streaming" : "Offline";
        options.msg    = `${colors.name(streamer.nm)} is ${streamer.state}`;
        super.checkStreamerState(streamer, options);
    }

    protected async checkBatch(batch: Array<Id>): Promise<boolean> {
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
        } catch (err) {
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

    public async getStreamers(): Promise<boolean> {
        if (!super.getStreamers()) {
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
        } catch (err) {
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
