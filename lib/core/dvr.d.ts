import { PostProcess } from "./postprocess";
import { Site } from "./site";
import { Tui } from "./tui";
export interface EnableConfig {
    daemon: boolean;
}
export interface RecordingConfig {
    autoConvertType: string;
    captureDirectory: string;
    completeDirectory: string;
    postprocess: string;
    dateFormat: string;
    fileNameFormat: string;
    includeSiteInDir: boolean;
    streamerSubdir: boolean;
    siteSubdir: boolean;
    keepTsFile: boolean;
    minSize: number;
    maxSize: number;
}
export interface LogConfig {
    enable: boolean;
    append: boolean;
}
export interface TuiConfig {
    enable: boolean;
    allowUnicode: boolean;
}
export interface ColorConfig {
    name: string;
    state: string;
    offline: string;
    prompt: string;
    file: string;
    time: string;
    site: string;
    cmd: string;
    debug: string;
    error: string;
}
export interface ProxyConfig {
    enable: boolean;
    server: string;
}
export interface DebugConfig {
    log: boolean;
    recorder: boolean;
    errortrace: boolean;
}
export interface Config {
    enable: EnableConfig;
    recording: RecordingConfig;
    postprocess: string;
    log: LogConfig;
    tui: TuiConfig;
    colors: ColorConfig;
    proxy: ProxyConfig;
    debug: DebugConfig;
}
export interface LogOptions {
    trace: boolean;
}
export declare abstract class Dvr {
    config: Config;
    logger: Console | undefined;
    postProcess: PostProcess;
    path: string;
    tryingToExit: boolean;
    configdir: string;
    configfile: string;
    tui: Tui | undefined;
    constructor(dir: string);
    protected findConfig(): string;
    loadConfig(): void;
    abstract exit(): void;
    mkdir(dir: string): string;
    calcPath(file: string): string;
    start(): Promise<void>;
    run(site: Site): Promise<void>;
    getDateTime(): string;
    protected log(text: string, options?: LogOptions): void;
    protected msg(msg: string, site?: Site | null, options?: LogOptions): void;
    infoMsg(msg: string, site?: Site | null): void;
    errMsg(msg: string, site?: Site | null): void;
    dbgMsg(msg: string, site?: Site | null): void;
}
