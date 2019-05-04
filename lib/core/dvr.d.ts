export default class Dvr {
    config: any;
    logger: any;
    postProcess: any;
    path: string;
    tryingToExit: boolean;
    configdir: string;
    configfile: string;
    tui: any;
    constructor(dir: any);
    protected findConfig(): string;
    protected loadConfig(): void;
    mkdir(dir: string): string;
    calcPath(file: string): string;
    run(site: any): Promise<void>;
    getDateTime(): string;
    protected log(text: string, options: any): void;
    protected msg(msg: string, site: any, options: any): void;
    infoMsg(msg: string, site: any): void;
    errMsg(msg: string, site: any): void;
    dbgMsg(msg: string, site: any): void;
}
