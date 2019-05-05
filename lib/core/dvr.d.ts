import { PostProcess } from "./postprocess";
import { Site } from "./site";
import { Tui } from "./tui";
export declare class Dvr {
    config: any;
    logger: Console | undefined;
    postProcess: PostProcess;
    path: string;
    tryingToExit: boolean;
    configdir: string;
    configfile: string;
    tui: Tui | undefined;
    constructor(dir: string);
    protected findConfig(): string;
    protected loadConfig(): void;
    mkdir(dir: string): string;
    calcPath(file: string): string;
    run(site: Site): Promise<void>;
    getDateTime(): string;
    protected log(text: string, options: any): void;
    protected msg(msg: string, site?: Site, options?: any): void;
    infoMsg(msg: string, site?: Site): void;
    errMsg(msg: string, site?: Site): void;
    dbgMsg(msg: string, site: Site): void;
}
