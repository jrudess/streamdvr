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
export declare abstract class Site {
    config: SiteConfig;
    siteName: string;
    padName: string;
    streamerList: Map<string, Streamer>;
    redrawList: boolean;
    protected listName: string;
    protected cfgFile: string;
    protected updateName: string;
    protected tempList: Array<Array<string>>;
    protected paused: boolean;
    protected dvr: Dvr;
    protected tui: Tui;
    constructor(siteName: string, dvr: Dvr, tui: Tui);
    protected abstract togglePause(streamer: Streamer | undefined, options: any): Promise<boolean>;
    getStreamerList(): Streamer[];
    protected getFileName(nm: string): string;
    protected checkFileSize(): void;
    abstract connect(): Promise<boolean>;
    abstract disconnect(): Promise<boolean>;
    protected getCaptureArguments(url: string, filename: string, options?: any): string[];
    processUpdates(options: any): Promise<void>;
    protected abstract createListItem(id: Id): Array<string>;
    protected updateList(id: Id, options: any): Promise<boolean>;
    pause(): Promise<void>;
    protected updateStreamers(list: Array<string>, options: any): Promise<boolean>;
    protected addStreamer(id: Id, list: Array<Array<string>>, options: any): Promise<boolean>;
    protected removeStreamer(id: Id, list: Array<Array<string>>): boolean;
    protected checkStreamerState(streamer: Streamer | undefined, options?: any): Promise<void>;
    getStreamers(options?: any): Promise<boolean>;
    storeCapInfo(streamer: Streamer, filename: string, capture: any, isPostProcess: boolean): void;
    getNumCapsInProgress(): number;
    haltAllCaptures(): void;
    protected haltCapture(uid: string): void;
    protected writeConfig(): Promise<void>;
    protected abstract setupCapture(streamer: Streamer, url: string): any;
    protected canStartCap(uid: string): boolean;
    getCompleteDir(streamer: Streamer): string;
    protected refresh(streamer: Streamer | undefined, options?: any): Promise<void>;
    protected startCapture(capInfo: CapInfo): void;
    protected endCapture(streamer: Streamer, capInfo: CapInfo): Promise<void>;
    clearProcessing(streamer: Streamer): Promise<void>;
    protected render(redrawList: boolean): void;
    infoMsg(msg: string): void;
    errMsg(msg: string): void;
    dbgMsg(msg: string): void;
}
