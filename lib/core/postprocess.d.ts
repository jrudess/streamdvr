import { Dvr, Config } from "../core/dvr.js";
import { Site, Streamer, CapInfo } from "../core/site.js";
export declare class PostProcess {
    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<CapInfo>;
    constructor(dvr: Dvr);
    add(capInfo: CapInfo): Promise<void>;
    protected convert(): Promise<void>;
    protected postScript(site: Site | null, streamer: Streamer | null, completeDir: string, completeFile: string): Promise<void>;
    protected nextConvert(site: Site | null, streamer: Streamer | null): Promise<void>;
    protected getCompleteDir(site: Site | null, streamer: Streamer | null): string;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): string;
}
