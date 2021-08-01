import { Dvr, Config } from "../core/dvr.js";
import { Site, Streamer, CapInfo } from "../core/site.js";
export declare class PostProcess {
    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<CapInfo>;
    constructor(dvr: Dvr);
    add(capInfo: CapInfo): void;
    protected convert(): void;
    protected postScript(site: Site | undefined, streamer: Streamer | undefined, completeDir: string, completeFile: string): void;
    protected nextConvert(site: Site | undefined, streamer: Streamer | undefined): void;
    protected getCompleteDir(site: Site | undefined, streamer: Streamer | undefined): string;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): string;
    protected mvSync(oldPath: string, newPath: string): void;
}
