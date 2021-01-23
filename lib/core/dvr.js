"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dvr = exports.MSG = void 0;
const fs = require("fs");
const moment = require("moment");
const path = require("path");
const yaml = require("js-yaml");
const postprocess_1 = require("./postprocess");
const site_1 = require("./site");
const tui_1 = require("./tui");
const colors = require("colors");
async function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
var MSG;
(function (MSG) {
    MSG[MSG["INFO"] = 0] = "INFO";
    MSG[MSG["DEBUG"] = 1] = "DEBUG";
    MSG[MSG["ERROR"] = 2] = "ERROR";
})(MSG = exports.MSG || (exports.MSG = {}));
class Dvr {
    constructor(dir) {
        this.path = dir;
        this.tryingToExit = false;
        this.configdir = "";
        this.configfile = this.findConfig();
        const name = fs.readFileSync(this.configfile, "utf8");
        try {
            this.config = yaml.load(name);
        }
        catch (err) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
            process.exit(1);
        }
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
        const configfile = path.join(this.configdir, "config.yml");
        if (!fs.existsSync(configfile)) {
            console.log("ERROR: Could not find config.yml");
            process.exit(1);
        }
        return configfile;
    }
    loadConfig() {
        try {
            this.config = yaml.load(fs.readFileSync(this.configfile, "utf8"));
        }
        catch (err) {
            console.log(`ERROR: Failed to load config.yml: ${err.toString()}`);
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
            this.tui.render(false);
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
    async start() {
        // Scan capture directory for leftover ts files to convert
        // in case of a bad shutdown
        const allfiles = fs.readdirSync(this.config.recording.captureDirectory);
        const tsfiles = allfiles.filter((x) => x.match(/.*\.ts$/ig));
        for (const ts of tsfiles.values()) {
            const capInfo = {
                site: null,
                streamer: null,
                filename: ts.slice(0, -3),
                spawnArgs: [],
            };
            this.postProcess.add(capInfo);
        }
    }
    async run(site) {
        let init = true;
        site.start();
        while (true) {
            if (site.config.enable) {
                try {
                    if (init) {
                        await site.connect();
                    }
                    else {
                        await site.disconnect();
                        await site.connect();
                    }
                    await site.processUpdates(site_1.UpdateCmd.ADD);
                    await site.processUpdates(site_1.UpdateCmd.REMOVE);
                    await site.getStreamers();
                    init = false;
                }
                catch (err) {
                    site.print(MSG.ERROR, err.toString());
                    await site.disconnect();
                    init = true;
                }
            }
            else {
                await site.disconnect();
                site.stop();
                return;
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
        const time = `[${this.getDateTime()}]`;
        if (site) {
            this.log(`${colors.time(time)} ${colors.site(site.padName)} ${msg}`, options);
        }
        else {
            let outmsg = "DVR".padEnd(8, " ");
            outmsg = `${colors.time(time)} ${colors.site(outmsg)} ${msg}`;
            this.log(outmsg, options);
        }
    }
    print(lvl, msg, site) {
        let out = "";
        const options = { trace: false };
        if (lvl === MSG.ERROR) {
            out = `${colors.error("[ERROR]")} ${msg}`;
            options.trace = true;
        }
        else if (lvl === MSG.DEBUG) {
            if (this.config.debug.log) {
                out = `${colors.debug("[DEBUG]")} ${msg}`;
            }
        }
        else {
            out = msg;
        }
        if (out) {
            this.msg(out, site, options);
        }
    }
}
exports.Dvr = Dvr;
//# sourceMappingURL=dvr.js.map