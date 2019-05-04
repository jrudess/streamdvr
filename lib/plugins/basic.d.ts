declare const promisify: any;
declare const exec: any;
declare const Site: any;
declare const colors: any;
declare class Basic extends Site {
    constructor(siteName: string, dvr: any, tui: any, urlback: string);
    convertFormat(streamerList: Array<any>): Promise<void>;
    updateList(nm: string, options: any): any;
    createListItem(id: any): any[];
    togglePause(streamer: any, options: any): boolean;
    m3u8Script(nm: string): Promise<{
        status: boolean;
        m3u8: any;
    }>;
    checkStreamerState(streamer: any, options: any): Promise<void>;
    checkBatch(batch: any, options: any): Promise<boolean>;
    serialize(nms: any): any[][];
    getStreamers(options: any): Promise<any[]>;
    setupCapture(streamer: any, url: any): {
        spawnArgs: any;
        filename: any;
        streamer: any;
    };
}
