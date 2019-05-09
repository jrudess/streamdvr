"use strict";

import * as fs from "fs";
import * as moment from "moment";
import * as path from "path";
import * as yaml from "js-yaml";

import {PostProcess} from "./postprocess";
import {Site, CapInfo, UpdateOptions, UpdateOptionsDefault} from "./site";
import {Tui} from "./tui";

const colors = require("colors");

async function sleep(time: number): Promise<number> {
    return new Promise((resolve) => setTimeout(resolve, time));
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

    constructor(dir: string) {
        this.path = dir;
        this.tryingToExit = false;

        this.configdir = "";
        this.configfile = this.findConfig();

        const config: string = fs.readFileSync(this.configfile, "utf8");
        this.config = yaml.safeLoad(config);
        this.loadConfig();

        if (this.config.log.enable) {
            const {Console} = require("console");
            const attr = this.config.log.append ? "a" : "w";
            const logFile = fs.createWriteStream("./streamdvr.log", {flags: attr});
            this.logger = new Console({stdout: logFile, stderr: logFile});
        }

        if (this.config.tui.enable) {
            this.tui = new Tui(this);
        }

        this.postProcess = new PostProcess(this);

    }

    protected findConfig() {
        let checkHome = 1;

        if (process.env.XDG_CONFIG_HOME) {
            this.configdir = process.env.XDG_CONFIG_HOME + "/streamdvr/";
            if (fs.existsSync(this.configdir + "config.yml")) {
                checkHome = 0;
            }
        }

        if (checkHome) {
            this.configdir = process.platform === "win32" ?
                `${process.env.APPDATA}` + "/streamdvr/" :
                `${process.env.HOME}` + "/.config/streamdvr/";
        }

        if (!fs.existsSync(this.configdir + "config.yml")) {
            this.configdir = "./config/";
        }

        const configfile = this.configdir + "config.yml";
        if (!fs.existsSync(configfile)) {
            console.log("ERROR: Could not find config.yml");
            process.exit(1);
        }

        return configfile;
    }

    public loadConfig() {
        try {
            this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));
        } catch (err) {
            console.log("ERROR: Failed to load config.yml:" + `${err.toString()}`);
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

    public mkdir(dir: string) {
        const fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, {recursive: true});
        return fulldir;
    }

    public calcPath(file: string) {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    }

    public async start() {
        // Scan capture directory for leftover ts files to convert
        // in case of a bad shutdown
        const allfiles = fs.readdirSync(this.config.recording.captureDirectory);
        const tsfiles: Array<string> = allfiles.filter((x: string) => x.match(/.*\.ts$/ig));

        for (const ts of tsfiles.values()) {
            const capInfo: CapInfo = {
                site:      null,
                streamer:  null,
                filename:  ts.slice(0, -3),
                spawnArgs: [],
            };

            this.postProcess.add(capInfo);
        }
    }

    public async run(site: Site) {
        const add: UpdateOptions = UpdateOptionsDefault;
        const remove: UpdateOptions = UpdateOptionsDefault;
        remove.add = false;

        while (true) {
            try {
                await site.disconnect();
                await site.connect();
                await site.processUpdates(add);
                await site.processUpdates(remove);
                await site.getStreamers();
            } catch (err) {
                site.errMsg(err.toString());
            }
            const interval = site.config.scanInterval ? site.config.scanInterval : 300;
            await sleep(interval * 1000);
        }
    }

    public getDateTime() {
        return moment().format(this.config.recording.dateFormat);
    }

    protected log(text: string, options?: LogOptions) {
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

    protected msg(msg: string, site?: Site | null, options?: LogOptions) {
        const time: string = "[" + this.getDateTime() + "] ";
        if (site) {
            this.log(`${colors.time(time)}` + `${colors.site(site.padName)}` + msg, options);
        } else {
            let outmsg: string = "DVR".padEnd(9, " ");
            outmsg = `${colors.time(time)}` + `${colors.site(outmsg)}` + msg;
            this.log(outmsg, options);
        }
    }

    public infoMsg(msg: string, site?: Site | null) {
        this.msg(msg, site);
    }

    public errMsg(msg: string, site?: Site | null) {
        this.msg(`${colors.error("[ERROR] ")}` + msg, site, {trace: true});
    }

    public dbgMsg(msg: string, site?: Site | null) {
        if (this.config.debug.log) {
            this.msg(`${colors.debug("[DEBUG] ")}` + msg, site);
        }
    }

}
