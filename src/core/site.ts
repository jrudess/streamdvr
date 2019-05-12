"use strict";

import * as fs from "fs";
import * as yaml from "js-yaml";
import {spawn, ChildProcessWithoutNullStreams} from "child_process";
import {Dvr} from "../core/dvr.js";
import {Tui} from "../core/tui.js";

const colors = require("colors");

async function sleep(time: number): Promise<number> {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export interface Streamer {
    uid:          string;
    nm:           string;
    site:         string;
    state:        string;
    filename:     string;
    capture:      ChildProcessWithoutNullStreams | null;
    postProcess:  boolean;
    filesize:     number;
    stuckcounter: number;
    paused:       boolean;
    isTemp:       boolean;
}
export const StreamerDefaults: Streamer = {
    uid: "",
    nm:  "",
    site: "",
    state: "Offline",
    filename: "",
    capture: null,
    postProcess: false,
    filesize: 0,
    stuckcounter: 0,
    paused: false,
    isTemp: false,
};

export interface Id {
    uid: string;
    nm:  string;
}

export interface CapInfo {
    site:      Site | null;
    streamer:  Streamer | null;
    filename:  string;
    spawnArgs: Array<string>;
}
export const CapInfoDefaults: CapInfo = {
    site:      null,
    streamer:  null,
    filename:  "",
    spawnArgs: [],
};

export interface SiteConfig {
    name:         string;
    enable:       boolean;
    plugin:       string;
    siteUrl:      string;
    urlback:      string;
    m3u8fetch:    string;
    recorder:     string;
    username:     string;
    password:     string;
    scanInterval: number;
    batchSize:    number;
    streamers:    Array<Array<string>>;
}

export enum UpdateCmd {
    REMOVE = 0,
    ADD    = 1,
    PAUSE  = 2,
}

export interface StreamerStateOptions {
    msg: string;
    isStreaming: boolean;
    prevState: string;
    m3u8: string;
}

export const StreamerStateDefaults: StreamerStateOptions = {
    msg: "",
    isStreaming: false,
    prevState: "Offline",
    m3u8: "",
};

export abstract class Site {

    public config: SiteConfig;
    public siteName: string;
    public padName: string;
    public listName: string;
    public streamerList: Map<string, Streamer>;
    public redrawList: boolean;

    protected cfgFile: string;
    protected updateName: string;
    protected tempList: Array<Array<string>>;
    protected paused: boolean;

    protected dvr: Dvr;
    protected tui: Tui;

    constructor(siteName: string, dvr: Dvr, tui: Tui) {
        this.siteName     = siteName;
        this.dvr          = dvr;
        this.tui          = tui;
        this.padName      = siteName.padEnd(9, " ");
        this.listName     = siteName.toLowerCase();
        this.cfgFile      = dvr.configdir + this.listName + ".yml";
        this.updateName   = dvr.configdir + this.listName + "_updates.yml";
        this.config       = yaml.safeLoad(fs.readFileSync(this.cfgFile, "utf8"));
        this.tempList     = []; // temp record list (session only)
        this.streamerList = new Map(); // Refer to addStreamer() for JSON entries
        this.redrawList   = false;
        this.paused       = false;

        if (dvr.config.tui.enable) {
            tui.addSite(this);
        }

        this.infoMsg(this.config.streamers.length.toString() + " streamer(s) in config");

        if (typeof this.config.siteUrl === "undefined") {
            this.errMsg(this.cfgFile + " is missing siteUrl");
        }

    }

    protected abstract togglePause(streamer: Streamer): boolean;

    public getStreamerList() {
        return Array.from(this.streamerList.values());
    }

    protected getFileName(nm: string): string {
        let filename = this.dvr.config.recording.fileNameFormat ? this.dvr.config.recording.fileNameFormat : "%n_%s_%d";
        filename = filename.replace(/%s/gi, this.listName);
        filename = filename.replace(/%n/gi, nm);
        filename = filename.replace(/%d/gi, this.dvr.getDateTime());
        return filename;
    }

    protected checkFileSize() {
        const maxSize: number = this.dvr.config.recording.maxSize;
        for (const streamer of this.streamerList.values()) {
            if (streamer.capture === null || streamer.postProcess) {
                continue;
            }

            const stat: fs.Stats = fs.statSync(this.dvr.config.recording.captureDirectory + "/" + streamer.filename);
            const sizeMB: number = Math.round(stat.size / 1048576);
            this.dbgMsg(`${colors.file(streamer.filename)}` + ", size=" + sizeMB.toString()
                + "MB, maxSize=" + maxSize.toString() + "MB");
            if (sizeMB === streamer.filesize) {
                this.infoMsg(`${colors.name(streamer.nm)}` + " recording appears to be stuck (counter=" +
                    streamer.stuckcounter.toString() + "), file size is not increasing: " +
                    sizeMB.toString() + "MB");
                streamer.stuckcounter++;
            } else {
                streamer.filesize = sizeMB;
            }
            if (streamer.stuckcounter >= 2) {
                this.infoMsg(`${colors.name(streamer.nm)}` + " terminating stuck recording");
                this.haltCapture(streamer.uid);
                streamer.stuckcounter = 0;
                this.redrawList = true;
            } else if (maxSize !== 0 && sizeMB >= maxSize) {
                this.infoMsg(`${colors.name(streamer.nm)}` + " recording has exceeded file size limit (size=" +
                    sizeMB.toString() + " > maxSize=" + maxSize.toString() + ")");
                this.haltCapture(streamer.uid);
                this.redrawList = true;
            }
        }
    }

    public abstract start(): void;
    public abstract async connect(): Promise<boolean>;
    public abstract async disconnect(): Promise<boolean>;

    protected getCaptureArguments(url: string, filename: string, params?: Array<string>) {
        let args = [
            "-o",
            this.dvr.config.recording.captureDirectory + "/" + filename + ".ts",
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
            args.push("--" + this.listName + "-username=" + this.config.username);
        }

        if (this.config.password) {
            args.push("--" + this.listName + "-password=" + this.config.password);
        }

        if (params) {
            args = args.concat(params);
        }

        return args;
    }

    public async processUpdates(cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number) {
        if (!fs.existsSync(this.updateName)) {
            this.dbgMsg(this.updateName + " does not exist");
            return;
        }

        const updates = yaml.safeLoad(fs.readFileSync(this.updateName, "utf8"));
        let list = [];

        if (cmd === UpdateCmd.ADD) {
            if (updates.include && updates.include.length > 0) {
                this.infoMsg(`${updates.include.length}` + " streamer(s) to include");
                list = updates.include;
                updates.include = [];
            }
        } else if (updates.exclude && updates.exclude.length > 0) {
            this.infoMsg(`${updates.exclude.length}` + " streamer(s) to exclude");
            list = updates.exclude;
            updates.exclude = [];
        }

        // clear the processed array from file
        if (list.length > 0) {
            fs.writeFileSync(this.updateName, yaml.safeDump(updates), "utf8");
        }

        try {
            const dirty = await this.updateStreamers(list, cmd, isTemp, pauseTimer);
            if (dirty) {
                this.writeConfig();
            }
        } catch (err) {
            this.errMsg(err.toString());
        }
    }

    protected abstract createListItem(id: Id): Array<string>;

    public async updateList(id: Id, cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number): Promise<boolean> {
        let dirty = false;
        const list = isTemp ? this.tempList : this.config.streamers;
        if (cmd === UpdateCmd.PAUSE) {
            let streamer: Streamer | undefined = this.streamerList.get(id.uid);
            if (streamer && pauseTimer && pauseTimer > 0) {
                const print: string = streamer.paused ? " pausing for " : " unpausing for ";
                this.infoMsg(`${colors.name(id.nm)}` + print + `${pauseTimer.toString()}` + " seconds");
                await sleep(pauseTimer * 1000);
                this.infoMsg(`${colors.name(id.nm)}` + " pause-timer expired");
                streamer = this.streamerList.get(id.uid);
            }
            if (streamer) {
                dirty = this.togglePause(streamer);
                this.render(true);
            }
        } else if (cmd === UpdateCmd.ADD) {
            dirty = this.addStreamer(id, list, cmd, isTemp);
        } else if (cmd === UpdateCmd.REMOVE) {
            dirty = this.removeStreamer(id, list);
        }
        if (dirty) {
            if (isTemp) {
                this.tempList = list;
            } else {
                this.config.streamers = list;
            }
        }
        return dirty && !isTemp;
    }

    public pause() {
        this.paused = !this.paused;
        for (const [, streamer] of this.streamerList) {
            streamer.paused = this.paused;
            if (this.paused) {
                this.haltCapture(streamer.uid);
            } else if (streamer.state !== "Offline") {
                this.refresh(streamer);
            }
        }
        this.render(true);
    }

    protected async updateStreamers(list: Array<string>, cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number) {
        let dirty = false;

        for (const entry of list) {
            const id: Id = {
                uid: entry,
                nm: entry,
            };
            dirty = await this.updateList(id, cmd, isTemp, pauseTimer) || dirty;
        }

        return dirty;
    }

    protected addStreamer(id: Id, list: Array<Array<string>>, cmd: UpdateCmd, isTemp?: boolean) {
        let added = true;

        for (const entry of list) {
            if (entry[0] === id.uid) {
                this.errMsg(`${colors.name(id.nm)}` + " is already in the capture list");
                added = false;
                break;
            }
        }

        if (added) {
            this.infoMsg(`${colors.name(id.nm)}` + " added to capture list" + (isTemp ? " (temporarily)" : ""));
            list.push(this.createListItem(id));
        }

        if (!this.streamerList.has(id.uid)) {
            const streamer: Streamer = StreamerDefaults;
            streamer.uid = id.uid;
            streamer.nm = id.nm;
            streamer.site = this.padName;
            streamer.isTemp = isTemp ? true : false;
            streamer.paused = this.paused;
            this.streamerList.set(id.uid, streamer);
            this.render(true);
            this.refresh(streamer);
        }
        return added;
    }

    protected removeStreamer(id: Id, list: Array<Array<string>>) {
        if (this.streamerList.has(id.uid)) {
            this.infoMsg(`${colors.name(id.nm)}` + " removed from capture list.");
            this.haltCapture(id.uid);
            this.streamerList.delete(id.uid); // Note: deleting before recording/post-processing finishes
            this.render(true);

            for (let i = 0; i < this.config.streamers.length; i++) {
                if (this.config.streamers[i][0] === id.uid) {
                    list.splice(i, 1);
                    return true;
                }
            }
            return false;
        }
        this.errMsg(`${colors.name(id.nm)}` + " not in capture list.");
        return false;
    }

    protected checkStreamerState(streamer: Streamer, options: StreamerStateOptions) {
        if (streamer.state !== options.prevState) {
            this.infoMsg(options.msg);
            this.redrawList = true;
        }

        if (streamer.postProcess === false && streamer.capture !== null && !options.isStreaming) {
            // Sometimes the recording process doesn't end when a streamer
            // stops broadcasting, so terminate it.
            this.dbgMsg(`${colors.name(streamer.nm)}` + " is no longer broadcasting, terminating capture process (pid=" +
                streamer.capture.pid.toString() + ")");
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }

        if (options.isStreaming) {
            if (streamer.paused) {
                this.dbgMsg(`${colors.name(streamer.nm)}` + " is paused, recording not started.");
            } else if (this.canStartCap(streamer.uid)) {
                this.startCapture(this.setupCapture(streamer, options.m3u8));
            }
        }

        this.render(false);
    }

    public async getStreamers() {
        if (this.dvr.tryingToExit) {
            this.dbgMsg("Skipping lookup while exit in progress...");
            return false;
        }
        this.checkFileSize();
        return true;
    }

    public storeCapInfo(streamer: Streamer, filename: string, capture: ChildProcessWithoutNullStreams | null, isPostProcess: boolean) {
        streamer.filename = filename;
        streamer.capture = capture;
        if (isPostProcess) {
            streamer.postProcess = true;
            this.redrawList = true;
        }
        this.render(true);
    }

    public getNumCapsInProgress() {
        let count = 0;

        for (const streamer of this.streamerList.values()) {
            if (streamer.capture) {
               count++;
            }
        }

        return count;
    }

    public haltAllCaptures() {
        for (const streamer of this.streamerList.values()) {
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }

    protected haltCapture(uid: string) {
        if (this.streamerList.has(uid)) {
            const streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    }

    public writeConfig() {
        const fd = fs.openSync(this.cfgFile, "w");
        this.dbgMsg("Rewriting " + this.cfgFile);
        fs.writeFileSync(fd, yaml.safeDump(this.config));
        fs.closeSync(fd);
    }

    protected abstract setupCapture(streamer: Streamer, url: string): CapInfo;

    protected canStartCap(uid: string): boolean {
        if (this.streamerList.has(uid)) {
            const streamer: Streamer | undefined = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null) {
                this.dbgMsg(`${colors.name(streamer.nm)}` + " is already capturing");
                return false;
            }
            return true;
        }
        return false;
    }

    public getCompleteDir(streamer: Streamer) {
        let completeDir = this.dvr.config.recording.completeDirectory;

        if (this.dvr.config.recording.siteSubdir) {
            completeDir += "/" + this.siteName;
        }
        if (this.dvr.config.recording.streamerSubdir) {
            completeDir += "/" + streamer.nm;
            if (this.dvr.config.recording.includeSiteInDir) {
                completeDir += "_" + this.listName;
            }
            fs.mkdirSync(completeDir, {recursive: true});
        }

        return completeDir;
    }

    protected refresh(streamer: Streamer) {
        if (!this.dvr.tryingToExit && this.streamerList.has(streamer.uid)) {
            const options: StreamerStateOptions = StreamerStateDefaults;
            this.checkStreamerState(streamer, options);
        }
    }

    protected startCapture(capInfo: CapInfo) {
        if (!capInfo || !capInfo.streamer || capInfo.spawnArgs.length === 0) {
            return;
        }

        const streamer: Streamer = capInfo.streamer;
        const script: string = this.dvr.calcPath(this.config.recorder);
        const capture: ChildProcessWithoutNullStreams = spawn(script, capInfo.spawnArgs);

        this.dbgMsg("Starting recording: " +
            `${colors.cmd(script)}` + " " + `${colors.cmd(capInfo.spawnArgs.join(" "))}`);

        if (this.dvr.config.debug.recorder) {
            const logStream = fs.createWriteStream("./" + capInfo.filename + ".log", {flags: "w"});
            capture.stdout.pipe(logStream);
            capture.stderr.pipe(logStream);
        }

        if (capture.pid) {
            const filename = capInfo.filename + ".ts";
            this.infoMsg(`${colors.name(streamer.nm)}` + " recording started: " + `${colors.file(filename)}`);
            this.storeCapInfo(streamer, filename, capture, false);
        } else {
            this.errMsg(`${colors.name(streamer.nm)}` + " capture failed to start");
        }

        capture.on("close", () => {
            this.endCapture(streamer, capInfo);
        });

    }

    protected endCapture(streamer: Streamer, capInfo: CapInfo) {
        const fullname = capInfo.filename + ".ts";
        try {
            const stats: fs.Stats = fs.statSync(this.dvr.config.recording.captureDirectory + "/" + fullname);
            if (stats) {
                const sizeMB = stats.size / 1048576;
                if (sizeMB < this.dvr.config.recording.minSize) {
                    this.infoMsg(`${colors.name(streamer.nm)}` + " recording automatically deleted (size=" +
                        sizeMB.toString() + " < minSize=" + this.dvr.config.recording.minSize.toString() + ")");
                    fs.unlinkSync(this.dvr.config.recording.captureDirectory + "/" + fullname);
                    this.storeCapInfo(streamer, "", null, false);
                } else {
                    this.dvr.postProcess.add({site: this, streamer: streamer, filename: capInfo.filename, spawnArgs: []});
                }
            }
        } catch (err) {
            if (err.code === "ENOENT") {
                this.errMsg(`${colors.name(streamer.nm)}` + ", " + `${colors.file(capInfo.filename)}` +
                    ".ts not found in capturing directory, cannot convert to " + this.dvr.config.recording.autoConvertType);
            } else {
                this.errMsg(`${colors.name(streamer.nm)}` + ": " + `${err.toString()}`);
            }
            this.storeCapInfo(streamer, "", null, false);
        }
        this.refresh(streamer);
    }

    public clearProcessing(streamer: Streamer) {
        // Note: setting postProcess to undefined releases program to exit
        this.storeCapInfo(streamer, "", null, false);
        this.redrawList = true;

        streamer.postProcess = false;
        this.refresh(streamer);
    }

    protected render(redrawList: boolean) {
        if (this.dvr.config.tui.enable) {
            this.tui.render(redrawList || this.redrawList, this);
        }
    }

    public infoMsg(msg: string) {
        this.dvr.infoMsg(msg, this);
    }

    public errMsg(msg: string) {
        this.dvr.errMsg(msg, this);
    }

    public dbgMsg(msg: string) {
        this.dvr.dbgMsg(msg, this);
    }
}
