import { Dvr } from "../core/dvr.js";
import { Tui } from "../core/tui.js";
export interface Streamer {
    uid: string;
    nm: string;
    site: string;
    state: string;
    filename: string;
    capture: any;
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
export declare abstract class Site {
    config: any;
    padName: string;
    protected siteName: string;
    protected listName: string;
    protected cfgFile: string;
    protected updateName: string;
    protected tempList: Array<any>;
    protected streamerList: Map<string, Streamer>;
    protected redrawList: boolean;
    protected paused: boolean;
    protected dvr: Dvr;
    protected tui: Tui;
    constructor(siteName: string, dvr: Dvr, tui: Tui);
    protected abstract togglePause(streamer: Streamer | undefined, options: any): Promise<boolean>;
    getStreamerList(): Streamer[];
    protected getFileName(nm: string): string;
    protected checkFileSize(): void;
    connect(): void;
    disconnect(): void;
    protected getCaptureArguments(url: string, filename: string, options?: any): string[];
    processUpdates(options: any): Promise<void>;
    protected abstract createListItem(id: Id): void;
    protected updateList(id: Id, options: any): Promise<boolean>;
    pause(): Promise<void>;
    protected updateStreamers(list: Array<string>, options: any): Promise<boolean>;
    protected addStreamer(id: Id, list: Array<any>, options: any): Promise<boolean>;
    protected removeStreamer(id: Id, list: Array<any>): boolean;
    protected checkStreamerState(streamer: Streamer | undefined, options?: any): Promise<void>;
    getStreamers(options?: any): Promise<boolean>;
    storeCapInfo(streamer: Streamer, filename: string, capture: any, isPostProcess: boolean): void;
    getNumCapsInProgress(): number;
    haltAllCaptures(): void;
    protected haltCapture(uid: string): void;
    protected writeConfig(): Promise<void>;
    protected abstract setupCapture(streamer: Streamer, url: string): any;
    protected canStartCap(uid: string): boolean;
    getCompleteDir(streamer: Streamer): Promise<any>;
    protected refresh(streamer: Streamer | undefined, options?: any): Promise<void>;
    protected startCapture(capInfo: any): void;
    protected endCapture(streamer: Streamer, capInfo: any): Promise<void>;
    clearProcessing(streamer: Streamer): Promise<void>;
    protected render(redrawList: boolean): void;
    infoMsg(msg: string): void;
    errMsg(msg: string): void;
    dbgMsg(msg: string): void;
}
