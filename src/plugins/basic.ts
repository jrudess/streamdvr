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

    protected convertFormat(streamerList: Array<any>): void {
        const newList: Array<any> = [];
        for (const streamer of streamerList.values()) {
            newList.push([streamer, "unpaused"]);
        }
        this.config.streamers = newList;
        this.writeConfig();
    }

    protected createListItem(id: Id): Array<string> {
        return [id.nm, "unpaused"];
    }

    public start(): void {
        super.start();

        if (this.config.streamers.length > 0) {
            if (this.config.streamers[0].constructor !== Array) {
                this.print(MSG.INFO, `Upgrading ${this.cfgFile} to new format, this is a one-time conversion.`);
                this.convertFormat(this.config.streamers);
            }
        }

        for (const entry of this.config.streamers) {
            const nm: string = entry[0];
            if (!this.streamerList.has(nm)) {
                const streamer: Streamer = {
                    uid: nm,
                    nm: nm,
                    site: this.padName,
                    state: "Offline",
                    filename: "",
                    capture: null,
                    postProcess: false,
                    filesize: 0,
                    stuckcounter: 0,
                    paused: entry[this.pauseIndex] === "paused",
                    isTemp: false,
                };
                this.streamerList.set(nm, streamer);
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

    protected m3u8Script(nm: string) {
        const streamerUrl = this.config.siteUrl + nm + this.urlback;
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
        const stream = this.m3u8Script(streamer.nm);
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

    protected async checkBatch(batch: Array<string>): Promise<boolean> {
        try {
            const queries = [];
            for (const item of batch) {
                const streamer: Streamer | undefined = this.streamerList.get(item);
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

    protected serialize(nms: Array<string>): Array<Array<string>> {
        // Break the streamer list up into batches - this throttles the total
        // number of simultaneous lookups via streamlink/youtubedl by not being
        // fully parallel, and reduces the lookup latency by not being fully
        // serial.  Set batchSize to 0 for full parallel, or 1 for full serial.
        const serRuns: Array<Array<string>> = [];
        let count = 0;
        let batchSize = 5;
        if (typeof this.config.batchSize !== "undefined") {
            batchSize = this.config.batchSize === 0 ? nms.length : this.config.batchSize;
        }

        while (count < nms.length) {
            const parBatch: Array<string> = [];
            const limit = count + batchSize;

            for (let i = count; (i < limit) && (i < nms.length); i++) {
                parBatch.push(nms[i]);
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

        const nms: Array<string> = [];
        for (const streamer of this.streamerList.values()) {
            nms.push(streamer.nm);
        }

        const serRuns: Array<Array<string>> = this.serialize(nms);

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
        const newurl: string = this.config.recorder === "scripts/record_streamlink.sh" ? this.config.siteUrl + streamer.nm : url;

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
