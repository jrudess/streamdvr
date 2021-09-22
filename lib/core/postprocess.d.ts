import { Dvr, Config } from "./dvr";
import { Site, Streamer, CapInfo } from "./site";
export declare class PostProcess {
    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<CapInfo>;
    constructor(dvr: Dvr);
    add(capInfo: CapInfo): Promise<void>;
    protected convert(): Promise<void>;
    protected postScript(site: Site | undefined, streamer: Streamer | undefined, completeDir: string, completeFile: string): Promise<void>;
    protected nextConvert(site: Site | undefined, streamer: Streamer | undefined): Promise<void>;
    protected getCompleteDir(site: Site | undefined, streamer: Streamer | undefined): Promise<string>;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): Promise<string>;
    protected mv(oldPath: string, newPath: string): Promise<void>;
}
