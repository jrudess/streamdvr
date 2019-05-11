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
export declare const StreamerDefaults: Streamer;
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
export interface UpdateOptions {
    add: boolean;
    pause: boolean;
    pausetimer: number;
    isTemp: boolean;
}
export declare function UpdateOptionsDefault(): UpdateOptions;
export interface StreamerStateOptions {
    msg: string;
    isStreaming: boolean;
    prevState: string;
    init: boolean;
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
    protected tempList: Array<Array<string>>;
    protected paused: boolean;
    protected dvr: Dvr;
    protected tui: Tui;
    constructor(siteName: string, dvr: Dvr, tui: Tui);
    protected abstract togglePause(streamer: Streamer): boolean;
    getStreamerList(): Streamer[];
    protected getFileName(nm: string): string;
    protected checkFileSize(): void;
    abstract connect(): Promise<boolean>;
    abstract disconnect(): Promise<boolean>;
    protected getCaptureArguments(url: string, filename: string, params?: Array<string>): string[];
    processUpdates(options: UpdateOptions): Promise<void>;
    protected abstract createListItem(id: Id): Array<string>;
    updateList(id: Id, options: UpdateOptions): Promise<boolean>;
    pause(): void;
    protected updateStreamers(list: Array<string>, options: UpdateOptions): Promise<boolean>;
    protected addStreamer(id: Id, list: Array<Array<string>>, options: UpdateOptions): boolean;
    protected removeStreamer(id: Id, list: Array<Array<string>>): boolean;
    protected checkStreamerState(streamer: Streamer | undefined, options: StreamerStateOptions): void;
    getStreamers(): Promise<boolean>;
    storeCapInfo(streamer: Streamer, filename: string, capture: any, isPostProcess: boolean): void;
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
