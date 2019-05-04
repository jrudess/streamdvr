export default class PostProcess {
    protected dvr: any;
    protected config: any;
    protected postProcessQ: Array<any>;
    constructor(dvr: any);
    add(capInfo: any): Promise<void>;
    protected convert(): Promise<void>;
    protected postScript(site: any, streamer: any, completeDir: string, completeFile: string): Promise<void>;
    protected nextConvert(site: any, streamer: any): Promise<void>;
    protected getCompleteDir(site: any, streamer: any): Promise<any>;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): string;
}
