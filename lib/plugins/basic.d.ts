declare const colors: any;
declare const promisify: any;
declare const exec: any;
declare const Site: any;
declare class Basic extends Site {
    constructor(siteName: string, dvr: any, tui: any, urlback: string);
    protected convertFormat(streamerList: Array<any>): Promise<void>;
    protected updateList(nm: string, options: any): any;
    protected createListItem(id: any): any[];
    togglePause(streamer: any, options: any): boolean;
    protected m3u8Script(nm: string): Promise<{
        status: boolean;
        m3u8: any;
    }>;
    protected checkStreamerState(streamer: any, options: any): Promise<void>;
    protected checkBatch(batch: any, options: any): Promise<boolean>;
    protected serialize(nms: any): any[][];
    protected getStreamers(options: any): Promise<any[]>;
    protected setupCapture(streamer: any, url: any): {
        spawnArgs: any;
        filename: any;
        streamer: any;
    };
}
