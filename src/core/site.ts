"use strict";

import * as path from "path";
import * as yaml from "js-yaml";
import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import {Dvr, MSG} from "./dvr";
import {Tui} from "./tui";

const colors = require("colors");
const fs = require("fs");
const fsp = require("fs").promises;

export interface Streamer {
    uid:          string;
    nm:           string;
    site:         string;
    state:        string;
    filename:     string;
    capture:      ChildProcessWithoutNullStreams | undefined;
    postProcess:  boolean;
    filesize:     number;
    stuckcounter: number;
    paused:       boolean;
    isTemp:       boolean;
}

export interface Id {
    uid: string;
    nm:  string;
}

export interface CapInfo {
    site:      Site | undefined;
    streamer:  Streamer | undefined;
    filename:  string;
    spawnArgs: Array<string>;
}

export interface SiteConfig {
    name:           string;
    enable:         boolean;
    plugin:         string;
    siteUrl:        string;
    urlback:        string;
    m3u8fetch:      string;
    m3u8fetch_args: string;
    recorder:       string;
    recorder_args:  string;
    username:       string;
    password:       string;
    scanInterval:   number;
    batchSize:      number;
    streamers:      Array<Array<string>>;
}

export interface Updates {
    include: Array<string>;
    exclude: Array<string>;
}

export enum UpdateCmd {
    REMOVE = 0,
    ADD    = 1,
    PAUSE  = 2,
    EN_DIS = 3,
}

export interface StreamerStateOptions {
    msg:         string;
    isStreaming: boolean;
    prevState:   string;
    m3u8:        string;
}

export abstract class Site {

    public config: SiteConfig;
    public siteName: string;
    public padName: string;
    public listName: string;
    public streamerList: Map<string, Streamer>;
    public redrawList: boolean;

    protected cfgFile: string;
    protected updateName: string;
    protected paused: boolean;
    protected pauseIndex: number;
    protected running: boolean;

    protected dvr: Dvr;
    protected tui: Tui;

    public constructor(siteName: string, dvr: Dvr, tui: Tui) {
        this.siteName     = siteName;
        this.dvr          = dvr;
        this.tui          = tui;
        this.padName      = siteName.padEnd(8, " ");
        this.listName     = siteName.toLowerCase();
        this.cfgFile      = path.join(dvr.configdir, `${this.listName}.yml`);
        this.updateName   = path.join(dvr.configdir, `${this.listName}_updates.yml`);
        try {
            this.config   = yaml.load(fs.readFileSync(this.cfgFile, "utf8")) as SiteConfig;
        } catch (e: any) {
            this.print(MSG.ERROR, e.toString());
            process.exit(1);
        }
        this.streamerList = new Map();
        this.redrawList   = false;
        this.paused       = false;
        this.pauseIndex   = 1;
        this.running      = false;

        if (dvr.config.tui.enable) {
            tui.addSite(this);
        }

        this.print(MSG.INFO, `${this.config.streamers.length.toString()} streamer(s) in config`);

        if (typeof this.config.siteUrl === "undefined") {
            this.print(MSG.ERROR, `${this.cfgFile} is missing siteUrl`);
        }

    }

    protected async sleep(time: number): Promise<number> {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    public getStreamerList(): Array<Streamer> {
        return Array.from(this.streamerList.values());
    }

    protected getFileName(nm: string): string {
        let filename = this.dvr.config.recording.fileNameFormat ? this.dvr.config.recording.fileNameFormat : "%n_%s_%d";
        filename = filename.replace(/%s/gi, this.listName);
        filename = filename.replace(/%n/gi, nm);
        filename = filename.replace(/%d/gi, this.dvr.getDateTime());
        return filename;
    }

    protected async checkFileSize(streamer: Streamer, file: string) {
        const maxSize: number = this.dvr.config.recording.maxSize;
        const stat: any = await fsp.stat(file);
        const sizeMB: number  = Math.round(stat.size / 1048576);

        this.print(MSG.DEBUG, `${colors.file(streamer.filename)}, size=${sizeMB.toString()}MB, maxSize=${maxSize.toString()}MB`);
        if (sizeMB === streamer.filesize) {
            streamer.stuckcounter++;
            this.print(MSG.INFO, `${colors.name(streamer.nm)} recording appears to be stuck (counter=` +
                `${streamer.stuckcounter.toString()}), file size is not increasing: ${sizeMB.toString()}MB`);
        } else {
            streamer.filesize = sizeMB;
        }
        if (streamer.stuckcounter >= 2) {
            this.print(MSG.INFO, `${colors.name(streamer.nm)} terminating stuck recording`);
            this.haltCapture(streamer.uid);
            streamer.stuckcounter = 0;
            this.redrawList = true;
        } else if (maxSize !== 0 && sizeMB >= maxSize) {
            this.print(MSG.INFO, `${colors.name(streamer.nm)} recording has exceeded file size limit (size=` +
                `${sizeMB.toString()} > maxSize=${maxSize.toString()})`);
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }
        return true;
    }

    protected async processStreamers() {
        for (const streamer of this.streamerList.values()) {
            if (streamer.capture === undefined || streamer.postProcess) {
                continue;
            }

            const file: string = path.join(this.dvr.config.recording.captureDirectory, streamer.filename);
            try {
                await this.checkFileSize(streamer, file);
            } catch (err: any) {
                if (err.code === "ENOENT") {
                    this.print(MSG.ERROR, `${colors.name(streamer.nm)}, ${colors.file(file)} not found ` +
                        "in capturing directory, cannot check file size");
                } else {
                    this.print(MSG.ERROR, `${colors.name(streamer.nm)}: ${err.toString()}`);
                }
            }
        }
        return true;
    }

    public start(): void {
        this.running = true;
        this.print(MSG.DEBUG, "Site started");
    }

    public stop(): void {
        this.running = false;
        this.haltAllCaptures();
        this.streamerList.clear();
        this.print(MSG.DEBUG, "Site stopped");
    }

    public isRunning(): boolean {
        return this.running;
    }

    public abstract connect(): Promise<boolean>;
    public abstract disconnect(): Promise<boolean>;

    protected getCaptureArguments(url: string, filename: string, params?: Array<string>): Array<string> {
        let args: Array<string> = [
            "-o",
            path.join(this.dvr.config.recording.captureDirectory, `${filename}.ts`),
            "-s",
            url,
        ];

        if (this.dvr.config.proxy.enable) {
            args.push("-P");
            args.push(this.dvr.config.proxy.server);
        }

        if (this.dvr.config.debug.recorder) {
            args.push("-d");
        }

        if (this.config.username) {
            args.push(`--${this.listName}-username=${this.config.username}`);
        }

        if (this.config.password) {
            args.push(`--${this.listName}-password=${this.config.password}`);
        }

        if (this.config.recorder_args) {
            args = args.concat(this.config.recorder_args);
        }

        if (params) {
            args = args.concat(params);
        }

        return args;
    }

    public async processUpdates(cmd: UpdateCmd) {
        try {
            await fsp.access(this.updateName, fsp.F_OK);
        } catch {
            this.print(MSG.DEBUG, `${this.updateName} does not exist`);
            return;
        }

        let updates: Updates;
        try {
            const data: any = await fsp.readFile(this.updateName, "utf8");
            updates = yaml.load(data) as Updates;
        } catch (e: any) {
            this.print(MSG.ERROR, e.toString());
            return;
        }
        let list: Array<string> = [];

        if (cmd === UpdateCmd.ADD) {
            if (updates.include && updates.include.length > 0) {
                this.print(MSG.INFO, `${updates.include.length} streamer(s) to include`);
                list = updates.include;
                updates.include = [];
            }
        } else if (cmd === UpdateCmd.REMOVE) {
            if (updates.exclude && updates.exclude.length > 0) {
                this.print(MSG.INFO, `${updates.exclude.length} streamer(s) to exclude`);
                list = updates.exclude;
                updates.exclude = [];
            }
        }

        // clear the processed array from file
        if (list.length > 0) {
            await fsp.writeFile(this.updateName, yaml.dump(updates), "utf8");
        }

        try {
            this.render(true);
            const dirty: boolean = await this.updateStreamers(list, cmd);
            if (dirty) {
                await this.writeConfig();
            }
        } catch (err: any) {
            this.print(MSG.ERROR, err.toString());
        }
    }

    protected abstract createListItem(id: Id): Array<string>;

    public async updateList(id: Id, cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number): Promise<boolean> {
        let dirty: boolean = false;
        switch (cmd) {
        case UpdateCmd.PAUSE:  dirty = await this.pauseStreamer(id, pauseTimer); break;
        case UpdateCmd.ADD:    dirty = await this.addStreamer(id, isTemp); break;
        case UpdateCmd.REMOVE: dirty = this.removeStreamer(id); break;
        default: this.print(MSG.ERROR, "Unexpected cmd type"); break;
        }
        return dirty;
    }

    protected async updateStreamers(list: Array<string>, cmd: UpdateCmd) {
        let dirty = false;

        for (const entry of list) {
            const tokens = entry.split(/,/);
            const id: Id = {
                uid: tokens[0],
                nm: tokens.length > 1 ? tokens[1] : tokens[0],
            };
            dirty = await this.updateList(id, cmd) || dirty;
        }

        return dirty;
    }

    protected async addStreamer(id: Id, isTemp?: boolean) {
        let added: boolean = true;

        for (const entry of this.config.streamers) {
            if (entry[0] === id.uid) {
                this.print(MSG.ERROR, `${colors.name(id.nm)} is already in the capture list`);
                added = false;
                break;
            }
        }

        if (added) {
            this.print(MSG.INFO, `${colors.name(id.nm)} added to capture list` + (isTemp ? " (temporarily)" : ""));
            if (!isTemp) {
                this.config.streamers.push(this.createListItem(id));
            }
        }

        if (!this.streamerList.has(id.uid)) {
            const streamer: Streamer = {
                uid: id.uid,
                nm: id.nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                capture: undefined,
                postProcess: false,
                filesize: 0,
                stuckcounter: 0,
                paused: this.paused,
                isTemp: isTemp ? true : false,
            };
            this.streamerList.set(id.uid, streamer);
            this.render(true);
            await this.refresh(streamer);
        }
        return added;
    }

    protected removeStreamer(id: Id): boolean {
        if (!this.streamerList.has(id.uid)) {
            this.print(MSG.ERROR, `${colors.name(id.nm)} not in capture list.`);
            return false;
        }
        this.print(MSG.INFO, `${colors.name(id.nm)} removed from capture list.`);
        this.haltCapture(id.uid);
        this.streamerList.delete(id.uid); // Note: deleting before recording/post-processing finishes
        this.render(true);

        for (let i = 0; i < this.config.streamers.length; i++) {
            const tokens = this.config.streamers[i][0].split(/,/);
            if (tokens[0] === id.uid) {
                this.config.streamers.splice(i, 1);
                break;
            }
        }
        return true;
    }

    public async pauseStreamer(id: Id,  pauseTimer?: number) {
        let dirty = false;
        let streamer: Streamer | undefined = this.streamerList.get(id.uid);
        if (streamer && pauseTimer && pauseTimer > 0) {
            const print: string = streamer.paused ? "pausing for " : " unpausing for";
            this.print(MSG.INFO, `${colors.name(id.nm)} ${print} ${pauseTimer.toString()} seconds`);
            await this.sleep(pauseTimer * 1000);
            this.print(MSG.INFO, `${colors.name(id.nm)} pause-timer expired`);
            streamer = this.streamerList.get(id.uid);
        }
        if (streamer) {
            dirty = await this.togglePause(streamer);
            this.render(true);
        }
        return dirty;
    }

    public async pause() {
        this.paused = !this.paused;
        for (const [, streamer] of this.streamerList) {
            streamer.paused = this.paused;
            if (this.paused) {
                this.haltCapture(streamer.uid);
            } else if (streamer.state !== "Offline") {
                await this.refresh(streamer);
            }
        }
        this.render(true);
    }

    protected async togglePause(streamer: Streamer) {
        if (streamer.paused) {
            this.print(MSG.INFO, `${colors.name(streamer.nm)} is unpaused.`);
            streamer.paused = false; // must be set before calling refresh()
            await this.refresh(streamer);
        } else {
            this.print(MSG.INFO, `${colors.name(streamer.nm)} is paused.`);
            streamer.paused = true;
            this.haltCapture(streamer.uid);
        }

        for (const item of this.config.streamers) {
            if (item[0] === streamer.uid) {
                item[this.pauseIndex] = item[this.pauseIndex] === "paused" ? "unpaused" : "paused";
                return true;
            }
        }
        return false;
    }

    protected async checkStreamerState(streamer: Streamer, options?: StreamerStateOptions) {
        if (!options) {
            this.print(MSG.ERROR, "site::checkStreamerState() options input is undefined");
            return;
        }

        if (this.dvr.tryingToExit) {
            this.print(MSG.DEBUG, `${colors.name(streamer.nm)} skipping lookup due to shutdown request`);
            return;
        }

        if (streamer.state !== options.prevState) {
            this.print(MSG.INFO, options.msg);
            this.redrawList = true;
        }

        if (streamer.postProcess === false && streamer.capture !== undefined && !options.isStreaming) {
            // This issue entirely depends on whether the yt-dlp and/or
            // streamlink process robustly ends when a broadcast stops
            // (normally or through some error case like internet disconnection).
            //
            // If the recording process doesn't terminate when a recording stops,
            // then if a new broadcast starts before the old process ends, a new
            // recording will not get launched for the new broadcast.  This hung
            // state can persist indefinitely if the recorder has bad behavior.
            //
            // To partially fix this, when a streamer is detected as offline,
            // stop the recording.  At the next polling loop the recording
            // will start over if the m3u8 lookup succeeds.
            //
            // This does not solve the case where the broadcast stops and
            // restarts between polling loops.  If the old record process does
            // not end, then future recordings will not start until some kind
            // of offline detection occurs during m3u8 lookup.  However, the
            // 'file size increasing' check will eventually trigger and kill
            // the process, but that takes 3 polling loops to recover.
            //
            // As a result of this fix, an m3u8 lookup glitch can cause a false
            // offline detection which will stop the recording, even though the
            // broadcast is still running.  In the normal case, as soon as the
            // next polling loop runs, the m3u8 lookup will succeed and a new
            // recording will start with only up to one-polling loop of
            // recording lost.   In the worst case, the website is broken or
            // partially down and so m3u8 lookup is broken.  The recording will
            // get killed due to the m3u8 lookup even though the broadcast is
            // running fine.  Handling for the website being broken like this is
            // rare enough to justify not supporting.
            this.print(MSG.DEBUG, `${colors.name(streamer.nm)} is no longer broadcasting, ` +
                `terminating capture process`);
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }

        if (options.isStreaming) {
            if (streamer.paused) {
                this.print(MSG.DEBUG, `${colors.name(streamer.nm)} is paused, recording not started.`);
            } else if (this.canStartCap(streamer.uid)) {
                await this.startCapture(this.setupCapture(streamer, options.m3u8));
            }
        }

        this.render(false);
    }

    public async getStreamers() {
        if (this.dvr.tryingToExit) {
            this.print(MSG.DEBUG, "Skipping lookup while exit in progress...");
            return false;
        }
        await this.processStreamers();
        return true;
    }

    public storeCapInfo(streamer: Streamer, filename: string, capture: ChildProcessWithoutNullStreams | undefined, isPostProcess: boolean) {
        streamer.filename = filename;
        streamer.capture = capture;
        if (isPostProcess) {
            streamer.postProcess = true;
            this.redrawList = true;
        }
        this.render(true);
    }

    public getNumCapsInProgress(): number {
        let count = 0;

        for (const streamer of this.streamerList.values()) {
            if (streamer.capture) {
                count++;
            }
        }

        return count;
    }

    public haltAllCaptures(): void {
        for (const streamer of this.streamerList.values()) {
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.capture !== undefined && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }

    protected haltCapture(uid: string): void {
        if (this.streamerList.has(uid)) {
            const streamer: Streamer | undefined = this.streamerList.get(uid);
            if (streamer && streamer.capture !== undefined && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
                this.print(MSG.INFO, `${colors.name(streamer.nm)} recording stopped`);
            }
        }
    }

    public async writeConfig() {
        this.print(MSG.DEBUG, `Rewriting ${this.cfgFile}`);
        await fsp.writeFile(this.cfgFile, yaml.dump(this.config));
    }

    protected abstract setupCapture(streamer: Streamer, url: string): CapInfo;

    protected canStartCap(uid: string): boolean {
        if (this.streamerList.has(uid)) {
            const streamer: Streamer | undefined = this.streamerList.get(uid);
            if (streamer && streamer.capture !== undefined) {
                this.print(MSG.DEBUG, `${colors.name(streamer.nm)} is already capturing`);
                return false;
            }
            return true;
        }
        return false;
    }

    public async getCompleteDir(streamer: Streamer): Promise<string> {
        let completeDir: string = this.dvr.config.recording.completeDirectory;

        if (this.dvr.config.recording.siteSubdir) {
            completeDir += "/" + this.siteName;
        }
        if (this.dvr.config.recording.streamerSubdir) {
            completeDir += "/" + streamer.nm;
            if (this.dvr.config.recording.includeSiteInDir) {
                completeDir += "_" + this.listName;
            }
            await fsp.mkdir(completeDir, {recursive: true});
        }

        return completeDir;
    }

    protected async refresh(streamer: Streamer) {
        if (this.config.enable && this.streamerList.has(streamer.uid)) {
            await this.checkStreamerState(streamer);
        }
    }

    protected async startCapture(capInfo: CapInfo) {
        if (!capInfo || !capInfo.streamer || capInfo.spawnArgs.length === 0) {
            return;
        }

        const streamer: Streamer = capInfo.streamer;
        const script: string = this.dvr.calcPath(this.config.recorder);
        const capture: ChildProcessWithoutNullStreams = spawn(script, capInfo.spawnArgs);

        this.print(MSG.DEBUG, `Starting recording: ${colors.cmd(script)} ${colors.cmd(capInfo.spawnArgs.join(" "))}`);

        if (this.dvr.config.debug.recorder) {
            const logStream: any = fs.createWriteStream(`.${capInfo.filename}.log`, {flags: "w"});
            capture.stdout.pipe(logStream);
            capture.stderr.pipe(logStream);
        }

        if (capture.pid) {
            const filename: string = `${capInfo.filename}.ts`;
            this.print(MSG.INFO, `${colors.name(streamer.nm)} recording started: ${colors.file(filename)}`);
            this.storeCapInfo(streamer, filename, capture, false);
        } else {
            this.print(MSG.ERROR, `${colors.name(streamer.nm)} capture failed to start`);
        }

        capture.on("close", () => {
            void new Promise<void>(async () => {
                await this.endCapture(streamer, capInfo);
            });
        });
    }

    protected async endCapture(streamer: Streamer, capInfo: CapInfo) {
        const fullname: string = `${capInfo.filename}.ts`;
        try {
            const stats: any = await fsp.stat(path.join(this.dvr.config.recording.captureDirectory, fullname));
            if (stats) {
                const sizeMB: number = stats.size / 1048576;
                if (sizeMB < this.dvr.config.recording.minSize) {
                    this.print(MSG.INFO, `${colors.name(streamer.nm)} recording automatically deleted (size=${sizeMB.toString()}` +
                        ` < minSize=${this.dvr.config.recording.minSize.toString()})`);
                    await fsp.unlink(path.join(this.dvr.config.recording.captureDirectory, fullname));
                    this.storeCapInfo(streamer, "", undefined, false);
                } else {
                    await this.dvr.postProcess.add({
                        site: this,
                        streamer: streamer,
                        filename: capInfo.filename,
                        spawnArgs: [],
                    });
                }
            }
        } catch (err: any) {
            if (err.code === "ENOENT") {
                this.print(MSG.ERROR, `${colors.name(streamer.nm)}, ${colors.file(capInfo.filename + ".ts")} not found ` +
                    `in capturing directory, cannot convert to ${this.dvr.config.recording.autoConvertType}`);
            } else {
                this.print(MSG.ERROR, `${colors.name(streamer.nm)}: ${err.toString()}`);
            }
            this.storeCapInfo(streamer, "", undefined, false);
        }
        await this.refresh(streamer);
    }

    public async clearProcessing(streamer: Streamer) {
        // Note: setting postProcess to undefined releases program to exit
        this.storeCapInfo(streamer, "", undefined, false);
        this.redrawList = true;

        streamer.postProcess = false;
        await this.refresh(streamer);
    }

    protected render(redrawList: boolean): void {
        if (this.dvr.config.tui.enable) {
            this.tui.render(redrawList || this.redrawList, this);
        }
    }

    public print(lvl: MSG, msg: string): void {
        this.dvr.print(lvl, msg, this);
    }

}
