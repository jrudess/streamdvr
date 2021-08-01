/// <reference types="node" />
import { ChildProcessWithoutNullStreams } from "child_process";
import { Dvr, MSG } from "../core/dvr.js";
import { Tui } from "../core/tui.js";
export interface Streamer {
    uid: string;
    nm: string;
    site: string;
    state: string;
    filename: string;
    capture: ChildProcessWithoutNullStreams | undefined;
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
    site: Site | undefined;
    streamer: Streamer | undefined;
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
export interface Updates {
    include: Array<string>;
    exclude: Array<string>;
}
export declare enum UpdateCmd {
    REMOVE = 0,
    ADD = 1,
    PAUSE = 2,
    EN_DIS = 3
}
export interface StreamerStateOptions {
    msg: string;
    isStreaming: boolean;
    prevState: string;
    m3u8: string;
}
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
    protected running: boolean;
    protected dvr: Dvr;
    protected tui: Tui;
    constructor(siteName: string, dvr: Dvr, tui: Tui);
    protected sleep(time: number): Promise<number>;
    getStreamerList(): Array<Streamer>;
    protected getFileName(nm: string): string;
    protected checkFileSize(streamer: Streamer, file: string): void;
    protected processStreamers(): void;
    start(): void;
    stop(): void;
    isRunning(): boolean;
    abstract connect(): Promise<boolean>;
    abstract disconnect(): Promise<boolean>;
    protected getCaptureArguments(url: string, filename: string, params?: Array<string>): Array<string>;
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
    storeCapInfo(streamer: Streamer, filename: string, capture: ChildProcessWithoutNullStreams | undefined, isPostProcess: boolean): void;
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
    print(lvl: MSG, msg: string): void;
}
