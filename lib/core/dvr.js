"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const moment = require("moment");
const path = require("path");
const yaml = require("js-yaml");
const postprocess_1 = require("./postprocess");
const tui_1 = require("./tui");
const colors = require("colors");
async function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
class Dvr {
    constructor(dir) {
        this.path = dir;
        this.tryingToExit = false;
        this.configdir = "";
        this.configfile = this.findConfig();
        this.loadConfig();
        if (this.config.log.enable) {
            const { Console } = require("console");
            const attr = this.config.log.append ? "a" : "w";
            const logFile = fs.createWriteStream("./streamdvr.log", { flags: attr });
            this.logger = new Console({ stdout: logFile, stderr: logFile });
        }
        if (this.config.tui.enable) {
            this.tui = new tui_1.Tui(this);
        }
        this.postProcess = new postprocess_1.PostProcess(this);
    }
    findConfig() {
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
    loadConfig() {
        try {
            this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));
        }
        catch (err) {
            console.log("ERROR: Failed to load config.yml:" + err.toString());
            process.exit(1);
        }
        colors.setTheme({
            name: this.config.colors.name,
            state: this.config.colors.state,
            offline: this.config.colors.offline,
            prompt: this.config.colors.prompt,
            file: this.config.colors.file,
            time: this.config.colors.time,
            site: this.config.colors.site,
            cmd: this.config.colors.cmd,
            debug: this.config.colors.debug,
            error: this.config.colors.error,
        });
        this.config.recording.captureDirectory = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);
        if (this.config.tui.enable && this.tui) {
            this.tui.render(false, null);
        }
    }
    mkdir(dir) {
        const fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, { recursive: true });
        return fulldir;
    }
    calcPath(file) {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    }
    async run(site) {
        // Scan capture directory for leftover ts files to convert
        // in case of a bad shutdown
        const allfiles = fs.readdirSync(this.config.recording.captureDirectory);
        const tsfiles = allfiles.filter((x) => x.match(/.*\.ts/ig));
        for (const ts of tsfiles.values()) {
            await this.postProcess.add({ site: null, streamer: null, filename: ts.slice(0, -3), spawnArgs: [] });
        }
        let startup = true;
        await site.getStreamers({ init: startup });
        while (true) {
            try {
                if (!startup) {
                    await site.disconnect();
                    await site.connect();
                }
                await site.processUpdates({ add: true, init: startup });
                await site.processUpdates({ add: false, init: startup });
                await site.getStreamers();
                startup = false;
            }
            catch (err) {
                site.errMsg(err.toString());
            }
            const interval = site.config.scanInterval ? site.config.scanInterval : 300;
            await sleep(interval * 1000);
        }
    }
    getDateTime() {
        return moment().format(this.config.recording.dateFormat);
    }
    log(text, options) {
        if (this.config.tui.enable && this.tui) {
            this.tui.log(text);
        }
        else if (options && options.trace && this.config.debug.errortrace) {
            console.trace(text);
        }
        else if (!this.config.enable.daemon) {
            console.log(text);
        }
        if (this.logger) {
            this.logger.log(text);
        }
    }
    msg(msg, site, options) {
        const time = "[" + this.getDateTime() + "] ";
        if (site) {
            this.log(colors.time(time) + colors.site(site.padName) + msg, options);
        }
        else {
            this.log(colors.time(time) + colors.site("DVR".padEnd(9, " ")) + msg, options);
        }
    }
    infoMsg(msg, site) {
        this.msg(msg, site);
    }
    errMsg(msg, site) {
        this.msg(colors.error("[ERROR] ") + msg, site, { trace: true });
    }
    dbgMsg(msg, site) {
        if (this.config.debug.log) {
            this.msg(colors.debug("[DEBUG] ") + msg, site, null);
        }
    }
}
exports.Dvr = Dvr;
//# sourceMappingURL=dvr.js.map