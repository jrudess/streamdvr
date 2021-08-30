//"use strict";

import * as fs from "https://deno.land/std/fs/mod.ts";
import * as path from "https://deno.land/std/path/mod.ts";
import * as yaml from "https://deno.land/std/encoding/yaml.ts";
import * as log from "https://deno.land/std/log/mod.ts";
import * as colors from "https://deno.land/std/fmt/colors.ts";
import moment from "https://deno.land/x/momentjs@2.29.1-deno/mod.ts";
import {PostProcess} from "./postprocess.ts";
import {Site, CapInfo, UpdateCmd} from "./site.ts";
// import {Tui} from "./tui.ts";

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
    public logger: log.Logger | undefined;

    public postProcess: PostProcess;
    public path: string;
    public tryingToExit: boolean;
    public configdir: string | undefined;
    public configfile: string;
    // public tui: Tui | undefined;

    public constructor(dir: string) {
        this.path = dir;
        this.tryingToExit = false;

        this.configdir = "";
        this.configfile = this.findConfig();

        try {
            this.config = yaml.load(name) as Config;
        } catch (err: any) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
            process.exit(1);
            const name: string = Deno.readTextFileSync(this.configfile) as string;
            this.config = yaml.parse(name) as Config;
        } catch(err: any) {
            console.log("ERROR: Failed to load config.yml: " + err.toString());
            Deno.exit(1);
        }
        this.loadConfig();


        // if (this.config.tui.enable) {
        //     this.tui = new Tui(this);
        //  }

        this.postProcess = new PostProcess(this);
    }

    protected async sleep(time: number): Promise<number> {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    protected findConfig(): string {
        let checkHome = 1;

        let xdg_config: string | undefined = Deno.env.get("XDG_CONFIG_HOME");
        if (xdg_config !== undefined) {
            this.configdir = path.join(xdg_config, "streamdvr");
            if (fs.existsSync(path.join(this.configdir, "config.yml"))) {
                checkHome = 0;
            }
        }

        if (checkHome) {
            this.configdir = `${Deno.env.get("HOME")}/.config/streamdvr`;
        }

        if (this.configdir !== undefined) {
            if (!fs.existsSync(path.join(this.configdir, "config.yml"))) {
                this.configdir = "./config/";
            }
        } else {
            console.log("ERROR: Could not find config.yml");
            Deno.exit(1);
        }

        if (this.configdir !== undefined) {
            const configfile: string = path.join(this.configdir, "config.yml");
            if (!fs.existsSync(configfile)) {
                console.log("ERROR: Could not find config.yml");
                Deno.exit(1);
            }
            return configfile;
        }

        console.log("ERROR: Could not find config.yml");
        Deno.exit(1);
    }

    public loadConfig(): void {
        try {
            this.config = yaml.parse(Deno.readTextFileSync(this.configfile)) as Config;
        } catch (err: any) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
            Deno.exit(1);
        }

        // colors.setTheme({
        //     name:    this.config.colors.name,
        //     state:   this.config.colors.state,
        //     offline: this.config.colors.offline,
        //     prompt:  this.config.colors.prompt,
        //     file:    this.config.colors.file,
        //     time:    this.config.colors.time,
        //     site:    this.config.colors.site,
        //     cmd:     this.config.colors.cmd,
        //     debug:   this.config.colors.debug,
        //     error:   this.config.colors.error,
        // });

        this.config.recording.captureDirectory  = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);
        // fs.ensureDirSync(this.config.recording.captureDirectory);
        // fs.ensureDirSync(this.config.recording.completeDirectory);

        // if (this.config.tui.enable && this.tui) {
        //     this.tui.render(false);
        // }
    }

    public abstract exit(): void;

    public mkdir(dir: string): string {
        const fulldir: string = path.resolve(dir);
        if (!fs.existsSync(fulldir)) {
            fs.ensureDirSync(fulldir);
        }
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
        const allfiles: string[] = [];
        for await (const dirEntry of Deno.readDir(this.config.recording.captureDirectory)) {
            if (dirEntry.isFile) {
                allfiles.push(dirEntry.name);
            }
        }
        const tsfiles: string[] = allfiles.filter((x: string) => x.match(/.*\.ts$/ig));

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
                    this.print(MSG.ERROR, err.toString(), site);
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

    public print(lvl: MSG, msg: string, site?: Site | undefined) : void {
        let siteStr: string = site ? `${site.padName}` : "DVR     ";
        if (this.logger) {
            const m: string = `${siteStr} ${msg}`;
            // this.logger.info(m);
            if (lvl === MSG.INFO) {
                this.logger.info(m);
            } else if (lvl === MSG.DEBUG) {
                this.logger.debug(m);
            } else if (lvl === MSG.ERROR) {
                this.logger.error(m);
            }
        } else {
            if (lvl === MSG.INFO) {
                console.log(`[INFO] ${siteStr} ${msg}`);
            } else if (lvl === MSG.DEBUG) {
                console.log(`[DEBUG] ${siteStr} ${msg}`);
            } else if (lvl === MSG.ERROR) {
                console.log(`[ERROR] ${siteStr} ${msg}`);
            }
        }
    }

}
