import { Dvr } from "../core/dvr.js";
import { Site, CapInfo } from "../core/site.js";
export declare class PostProcess {
    protected dvr: Dvr;
    protected config: any;
    protected postProcessQ: Array<any>;
    constructor(dvr: any);
    add(capInfo: CapInfo): Promise<void>;
    protected convert(): Promise<void>;
    protected postScript(site: Site, streamer: any, completeDir: string, completeFile: string): Promise<void>;
    protected nextConvert(site: Site, streamer: any): Promise<void>;
    protected getCompleteDir(site: Site, streamer: any): Promise<any>;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): string;
}
