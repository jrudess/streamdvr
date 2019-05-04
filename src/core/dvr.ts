"use strict";

export {};

const colors        = require("colors");
const fs            = require("fs");
const moment        = require("moment");
const path          = require("path");
const yaml          = require("js-yaml");
const {Tui}         = require("./tui");
const {PostProcess} = require("./postprocess");

async function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class Dvr {

    public config: any;
    public logger: any;

    public postProcess: any;
    public path: string;
    public tryingToExit: boolean;
    public configdir: string;
    public configfile: string;
    public tui: any;

    constructor(dir: any) {
        this.path = dir;
        this.tryingToExit = false;

        this.configdir = "";
        this.configfile = this.findConfig();

        this.config = null;
        this.loadConfig();

        this.logger = null;
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

        // Scan capture directory for leftover ts files to convert
        // in case of a bad shutdown
        const allfiles = fs.readdirSync(this.config.recording.captureDirectory);
        const tsfiles = allfiles.filter((x: string) => x.match(/.*\.ts/ig));

        for (const ts of tsfiles.values()) {
            this.postProcess.add({site: null, streamer: null, filename: ts.slice(0, -3)});
        }

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
                process.env.APPDATA + "/streamdvr/" :
                process.env.HOME + "/.config/streamdvr/";
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

    protected loadConfig() {
        try {
            this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));
        } catch (err) {
            console.log("ERROR: Failed to load config.yml:" + err.toString());
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
            this.tui.display(this.config.tui.listshown ? "show" : "hide", "list");
            this.tui.display(this.config.tui.logshown  ? "show" : "hide", "log");
            this.tui.render();
        }
    }

    public mkdir(dir: string) {
        const fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, {recursive: true}, (err: any) => {
            if (err) {
                this.errMsg(err.toString(), null);
                process.exit(1);
            }
        });
        return fulldir;
    }

    public calcPath(file: string) {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    }

    public async run(site: any ) {
        let startup = true;
        await site.getStreamers({init: startup});
        while (true) {
            try {
                if (!startup) {
                    await site.disconnect();
                    await site.connect();
                }
                await site.processUpdates({add: true,  init: startup});
                await site.processUpdates({add: false, init: startup});
                await site.getStreamers();
                startup = false;
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

    protected log(text: string, options: any) {
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

    protected msg(msg: string, site: any, options: any) {
        const time = "[" + this.getDateTime() + "] ";
        if (site) {
            this.log(colors.time(time) + colors.site(site.padName) + msg, options);
        } else {
            this.log(colors.time(time) + colors.site("DVR".padEnd(9, " ")) + msg, options);
        }
    }

    public infoMsg(msg: string, site: any) {
        this.msg(msg, site, null);
    }

    public errMsg(msg: string, site: any) {
        this.msg(colors.error("[ERROR] ") + msg, site, {trace: true});
    }

    public dbgMsg(msg: string, site: any) {
        if (this.config.debug.log) {
            this.msg(colors.debug("[DEBUG] ") + msg, site, null);
        }
    }

}

exports.Dvr = Dvr;
