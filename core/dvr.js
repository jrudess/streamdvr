"use strict";

const fs      = require("fs");
const moment  = require("moment");
const mv      = require("mv");
const yaml    = require("js-yaml");
const path    = require("path");
const {spawn} = require("child_process");
const {Tui}   = require("./tui");
const colors  = require("colors");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class Dvr {

    constructor(dir) {
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
            this.tui = new Tui(this.config, this);
        }

        this.postProcessQ = [];

        // Scan capture directory for leftover ts files to convert due to bad
        // prior shutdown
        const allfiles = fs.readdirSync(this.config.recording.captureDirectory);
        const tsfiles = allfiles.filter((x) => x.match(/.*\.ts/ig));

        for (const ts of tsfiles.values()) {
            this.postProcessQ.push({site: null, streamer: null, filename: ts.slice(0, -3)});
        }
        if (this.postProcessQ.length > 0) {
            this.dbgMsg("Converting orphaned captures");
            this.postProcess();
        }

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
            if (process.platform === "win32") {
                this.configdir = process.env.APPDATA + "/streamdvr/";
            } else {
                this.configdir = process.env.HOME + "/.config/streamdvr/";
            }
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
            error:   this.config.colors.error
        });

        this.config.recording.captureDirectory  = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);

        if (this.config.tui.enable && this.tui && this.tui.list) {
            this.tui.display(this.config.tui.listshown ? "show" : "hide", "list");
            this.tui.display(this.config.tui.logshown  ? "show" : "hide", "log");
            this.tui.render();
        }
    }

    mkdir(dir) {
        const fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, {recursive: true}, (err) => {
            if (err) {
                this.errMsg(err.toString());
                process.exit(1);
            }
        });
        return fulldir;
    }

    calcPath(file) {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    }

    async getCompleteDir(site, streamer) {
        if (streamer === null) {
            const dir = this.config.recording.completeDirectory + "/UNKNOWN";
            this.mkdir(dir);
            return dir;
        }

        const dir = await site.getCompleteDir(streamer);
        return dir;
    }

    // Post processing is handled globally instead of per-site for easier
    // control of the number of jobs running.  Only one job at a time is
    // allowed right now, but a config option should be added to control it.
    async postProcess() {

        if (this.postProcessQ.length === 0) {
            throw new Error("post process queue is empty -- this should not happen");
        }

        // peek into queue, and pop in nextConvert()
        const capInfo     = this.postProcessQ[0];
        const site        = capInfo.site === null ? this : capInfo.site;
        const streamer    = capInfo.streamer;
        const capName     = capInfo.filename + ".ts";
        const finalName   = capInfo.filename + "." + this.config.recording.autoConvertType;
        const completeDir = await this.getCompleteDir(site, streamer);
        const namePrint   = streamer === null ? "" : streamer.nm.name + " ";

        if (this.config.recording.autoConvertType !== "mp4" && this.config.recording.autoConvertType !== "mkv") {
            site.dbgMsg(namePrint + "recording moved (" + this.config.recording.captureDirectory + "/" +
                capName + " to " + completeDir + "/" + capName);
            mv(this.config.recording.captureDirectory + "/" + capName, completeDir + "/" + capName, (err) => {
                if (err) {
                    this.errMsg(capInfo.filename.site + ": " + err.toString());
                }
            });

            this.postScript(site, streamer, capName);
            return;
        }

        if (site !== this) {
            site.setProcessing(streamer);
        }

        const args = [
            this.config.recording.captureDirectory + "/" + capName,
            completeDir + "/" + finalName,
            this.config.recording.autoConvertType
        ];

        // If the output file already exists, make filename unique
        let count = 0;
        while (fs.existsSync(args[1])) {
            this.errMsg(args[1] + " already exists");
            args[1] = completeDir + "/" + capInfo.filename + " (" + count + ")." +
                this.config.recording.autoConvertType;
            count++;
        }

        const script = this.calcPath(this.config.recording.postprocess);

        const cmd = script + " " + args.toString().replace(/,/g, " ");
        site.infoMsg(namePrint + "converting to " + this.config.recording.autoConvertType + ": " + cmd.cmd);

        const myCompleteProcess = spawn(script, args);
        if (site !== this) {
            site.storeCapInfo(streamer, finalName, null);
        }

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(args[0]);
            }

            site.infoMsg(namePrint + "done converting " + finalName);
            this.postScript(site, streamer, finalName);
        });

        myCompleteProcess.on("error", (err) => {
            this.errMsg(err.toString());
        });
    }

    postScript(site, streamer, finalName) {
        if (this.config.postprocess) {
            const script    = this.calcPath(this.config.postprocess);
            const args      = [this.config.recording.completeDirectory, finalName];
            const namePrint = streamer === null ? "" : streamer.nm.name + " ";
            const cmd       = script + " " + args.toString().replace(/,/g, " ");

            site.infoMsg(namePrint + "running global postprocess script: " + cmd.cmd);
            const userPostProcess = spawn(script, args);

            userPostProcess.on("close", () => {
                site.infoMsg(namePrint + "done post-processing " + finalName.file);
                this.nextConvert(site, streamer);
            });
        } else {
            this.nextConvert(site, streamer);
        }
    }

    nextConvert(site, streamer) {

        if (site !== this) {
            site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.postProcess();
        }
    }

    async run(site) {
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
            if (site.config.scanInterval) {
                await sleep(site.config.scanInterval * 1000);
            } else {
                site.errMsg("Missing scanInterval option in " + site.cfgFile + ". Using 300s instead");
                await sleep(300 * 1000);
            }
        }
    }

    start() {
        if (this.config.tui.enable) {
            this.tui.start();
        }
    }

    exit() {
        // Virtual function that can be implemented by extended class
        // Should probably be using events here.  The TUI exit
        // characters trigger this.
    }

    getDateTime() {
        return moment().format(this.config.recording.dateFormat);
    }

    log(text, options) {
        if (this.config.tui.enable) {
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

    msg(msg, site, options) {
        const time = "[" + this.getDateTime() + "] ";
        if (site) {
            this.log(time.time + site.padName.site + msg, options);
        } else {
            this.log(time.time + "DVR".padEnd(9, " ").site + msg, options);
        }
    }

    infoMsg(msg, site) {
        this.msg(msg, site);
    }

    errMsg(msg, site) {
        this.msg("[ERROR] ".error + msg, site, {trace: true});
    }

    dbgMsg(msg, site) {
        if (this.config.debug.log) {
            this.msg("[DEBUG] ".debug + msg, site);
        }
    }

}

exports.Dvr = Dvr;
