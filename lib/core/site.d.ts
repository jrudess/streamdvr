/// <reference types="node" />
import { ChildProcessWithoutNullStreams } from "child_process";
import { Dvr } from "../core/dvr.js";
import { Tui } from "../core/tui.js";
export interface Streamer {
    uid: string;
    nm: string;
    site: string;
    state: string;
    filename: string;
    capture: ChildProcessWithoutNullStreams | null;
    postProcess: boolean;
    filesize: number;
    stuckcounter: number;
    paused: boolean;
    isTemp: boolean;
}
export interface Id {
    uid: string;
    nm: string;
}
export interface CapInfo {
    site: Site | null;
    streamer: Streamer | null;
    filename: string;
    spawnArgs: Array<string>;
}
export declare const CapInfoDefaults: CapInfo;
export interface SiteConfig {
    name: string;
    enable: boolean;
    plugin: string;
    siteUrl: string;
    urlback: string;
    m3u8fetch: string;
    recorder: string;
    username: string;
    password: string;
    scanInterval: number;
    batchSize: number;
    streamers: Array<Array<string>>;
}
export declare enum UpdateCmd {
    REMOVE = 0,
    ADD = 1,
    PAUSE = 2
}
export interface StreamerStateOptions {
    msg: string;
    isStreaming: boolean;
    prevState: string;
    m3u8: string;
}
export declare const StreamerStateDefaults: StreamerStateOptions;
export declare abstract class Site {
    config: SiteConfig;
    siteName: string;
    padName: string;
    listName: string;
    streamerList: Map<string, Streamer>;
    redrawList: boolean;
    protected cfgFile: string;
    protected updateName: string;
    protected paused: boolean;
    protected pauseIndex: number;
    protected dvr: Dvr;
    protected tui: Tui;
    constructor(siteName: string, dvr: Dvr, tui: Tui);
    getStreamerList(): Streamer[];
    protected getFileName(nm: string): string;
    protected checkFileSize(): void;
    abstract start(): void;
    abstract connect(): Promise<boolean>;
    abstract disconnect(): Promise<boolean>;
    protected getCaptureArguments(url: string, filename: string, params?: Array<string>): string[];
    processUpdates(cmd: UpdateCmd): Promise<void>;
    protected abstract createListItem(id: Id): Array<string>;
    updateList(id: Id, cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number): Promise<boolean>;
    protected updateStreamers(list: Array<string>, cmd: UpdateCmd): Promise<boolean>;
    protected addStreamer(id: Id, isTemp?: boolean): boolean;
    protected removeStreamer(id: Id): boolean;
    pauseStreamer(id: Id, pauseTimer?: number): Promise<boolean>;
    pause(): void;
    protected togglePause(streamer: Streamer): boolean;
    protected checkStreamerState(streamer: Streamer, options?: StreamerStateOptions): void;
    getStreamers(): Promise<boolean>;
    storeCapInfo(streamer: Streamer, filename: string, capture: ChildProcessWithoutNullStreams | null, isPostProcess: boolean): void;
    getNumCapsInProgress(): number;
    haltAllCaptures(): void;
    protected haltCapture(uid: string): void;
    writeConfig(): void;
    protected abstract setupCapture(streamer: Streamer, url: string): CapInfo;
    protected canStartCap(uid: string): boolean;
    getCompleteDir(streamer: Streamer): string;
    protected refresh(streamer: Streamer): void;
    protected startCapture(capInfo: CapInfo): void;
    protected endCapture(streamer: Streamer, capInfo: CapInfo): void;
    clearProcessing(streamer: Streamer): void;
    protected render(redrawList: boolean): void;
    infoMsg(msg: string): void;
    errMsg(msg: string): void;
    dbgMsg(msg: string): void;
}
