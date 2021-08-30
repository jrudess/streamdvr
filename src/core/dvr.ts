"use strict";

import * as fs from "fs";
import * as moment from "moment";
import * as path from "path";
import * as yaml from "js-yaml";

import {PostProcess} from "./postprocess";
import {Site, CapInfo, UpdateCmd} from "./site";
import {Tui} from "./tui";

const colors = require("colors");
const fsp = require("fs/promises");

export enum MSG {
    INFO  = 0,
    DEBUG = 1,
    ERROR = 2,
}

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
    name:    string;
    state:   string;
    offline: string;
    prompt:  string;
    file:    string;
    time:    string;
    site:    string;
    cmd:     string;
    debug:   string;
    error:   string;
}

export interface ProxyConfig {
    enable: boolean;
    server: string;
}

export interface DebugConfig {
    log:        boolean;
    recorder:   boolean;
    errortrace: boolean;
}

export interface Config {
    enable:      EnableConfig;
    recording:   RecordingConfig;
    postprocess: string;
    log:         LogConfig;
    tui:         TuiConfig;
    colors:      ColorConfig;
    proxy:       ProxyConfig;
    debug:       DebugConfig;
}

export interface LogOptions {
    trace: boolean;
}

export abstract class Dvr {

    public config: Config;
    public logger: Console | undefined;

    public postProcess: PostProcess;
    public path: string;
    public tryingToExit: boolean;
    public configdir: string;
    public configfile: string;
    public tui: Tui | undefined;

    public constructor(dir: string) {
        this.path = dir;
        this.tryingToExit = false;

        this.configdir = "";
        this.configfile = this.findConfig();

        const name: string = fs.readFileSync(this.configfile, "utf8");
        try {
            this.config = yaml.load(name) as Config;
        } catch (err: any) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
            process.exit(1);
        }
        this.loadConfig();

        if (this.config.log.enable) {
            const {Console} = require("console");
            const attr: string = this.config.log.append ? "a" : "w";
            const logFile: fs.WriteStream = fs.createWriteStream("./streamdvr.log", {flags: attr});
            this.logger = new Console({stdout: logFile, stderr: logFile});
        }

        if (this.config.tui.enable) {
            this.tui = new Tui(this);
        }

        this.postProcess = new PostProcess(this);
    }

    protected async sleep(time: number): Promise<number> {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    protected findConfig(): string {
        let checkHome = 1;

        if (process.env.XDG_CONFIG_HOME) {
            this.configdir = path.join(process.env.XDG_CONFIG_HOME, "streamdvr");
            if (fs.existsSync(path.join(this.configdir, "config.yml"))) {
                checkHome = 0;
            }
        }

        if (checkHome) {
            this.configdir = `${process.env.HOME}/.config/streamdvr`;
        }

        if (!fs.existsSync(path.join(this.configdir, "config.yml"))) {
            this.configdir = "./config/";
        }

        const configfile: string = path.join(this.configdir, "config.yml");
        if (!fs.existsSync(configfile)) {
            console.log("ERROR: Could not find config.yml");
            process.exit(1);
        }

        return configfile;
    }

    public loadConfig(): void {
        try {
            this.config = yaml.load(fs.readFileSync(this.configfile, "utf8")) as Config;
        } catch (err: any) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
            process.exit(1);
        }

        colors.setTheme({
            name:    this.config.colors.name,
            state:   this.config.colors.state,
            offline: this.config.colors.offline,
            prompt:  this.config.colors.prompt,
            file:    this.config.colors.file,
            time:    this.config.colors.time,
            site:    this.config.colors.site,
            cmd:     this.config.colors.cmd,
            debug:   this.config.colors.debug,
            error:   this.config.colors.error,
        });

        this.config.recording.captureDirectory  = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);

        if (this.config.tui.enable && this.tui) {
            this.tui.render(false);
        }
    }

    public abstract exit(): void;

    public mkdir(dir: string): string {
        const fulldir: string = path.resolve(dir);
        fs.mkdirSync(fulldir, {recursive: true});
        return fulldir;
    }

    public calcPath(file: string): string {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    }

    public async start() {
        // Scan capture directory for leftover ts files to convert
        // in case of a bad shutdown
        const allfiles: Array<string> = await fsp.readdir(this.config.recording.captureDirectory);
        const tsfiles: Array<string> = allfiles.filter((x: string) => x.match(/.*\.ts$/ig));

        for (const ts of tsfiles.values()) {
            const capInfo: CapInfo = {
                site:      undefined,
                streamer:  undefined,
                filename:  ts.slice(0, -3),
                spawnArgs: [],
            };

            await this.postProcess.add(capInfo);
        }
    }

    public async run(site: Site) {
        let init: boolean = true;
        site.start();
        while (true) {
            if (site.config.enable) {
                try {
                    if (init) {
                        init = false;
                    } else {
                        await site.disconnect();
                    }
                    await site.connect();
                    await site.processUpdates(UpdateCmd.ADD);
                    await site.processUpdates(UpdateCmd.REMOVE);
                    await site.getStreamers();
                } catch (err: any) {
                    site.print(MSG.ERROR, err.toString());
                    await site.disconnect();
                    init = true;
                }
            } else {
                await site.disconnect();
                site.stop();
                return;
            }
            const interval: number = site.config.scanInterval ? site.config.scanInterval : 300;
            await this.sleep(interval * 1000);
        }
    }

    public getDateTime(): string {
        return moment().format(this.config.recording.dateFormat);
    }

    protected log(text: string, options?: LogOptions): void {
        if (this.config.tui.enable && this.tui) {
            this.tui.log(text);
        } else if (options && options.trace && this.config.debug.errortrace) {
            console.trace(text);
        } else if (!this.config.enable.daemon) {
            console.log(text);
        }
        if (this.logger) {
            this.logger.log(text);
        }
    }

    protected msg(msg: string, site?: Site | undefined, options?: LogOptions): void {
        const time: string = `[${this.getDateTime()}]`;
        if (site) {
            this.log(`${colors.time(time)} ${colors.site(site.padName)} ${msg}`, options);
        } else {
            let outmsg: string = "DVR".padEnd(8, " ");
            outmsg = `${colors.time(time)} ${colors.site(outmsg)} ${msg}`;
            this.log(outmsg, options);
        }
    }

    public print(lvl: MSG, msg: string, site?: Site | undefined): void {
        let out: string = "";
        const options = {trace: false};
        if (lvl === MSG.ERROR) {
            out = `${colors.error("[ERROR]")} ${msg}`;
            options.trace = true;
        } else if (lvl === MSG.DEBUG) {
            if (this.config.debug.log) {
                out = `${colors.debug("[DEBUG]")} ${msg}`;
            }
        } else {
            out = msg;
        }
        if (out) {
            this.msg(out, site, options);
        }
    }

}
