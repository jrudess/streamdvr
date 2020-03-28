import { Dvr, Config } from "../core/dvr.js";
import { Site, Streamer, CapInfo } from "../core/site.js";
export declare class PostProcess {
    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<CapInfo>;
    constructor(dvr: Dvr);
    add(capInfo: CapInfo): void;
    protected convert(): void;
    protected postScript(site: Site | null, streamer: Streamer | null, completeDir: string, completeFile: string): void;
    protected nextConvert(site: Site | null, streamer: Streamer | null): void;
    protected getCompleteDir(site: Site | null, streamer: Streamer | null): string;
    protected uniqueFileName(completeDir: string, filename: string, fileType: string): string;
    protected mvSync(oldPath: string, newPath: string): void;
}
