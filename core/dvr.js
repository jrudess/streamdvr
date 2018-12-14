"use strict";

const fs      = require("fs");
const mv      = require("mv");
const colors  = require("colors/safe");
const yaml    = require("js-yaml");
const path    = require("path");
const {spawn} = require("child_process");
const {Tui}   = require("./tui");

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

        this.startup = 1;

        this.logger = null;
        if (this.config.log.enable) {
            const {Console} = require("console");
            const attr = (this.config.log.append) ? "a" : "w";
            const logFile = fs.createWriteStream("./streamdvr.log", {flags: attr});
            this.logger = new Console({stdout: logFile, stderr: logFile});
        }

        if (this.config.tui.enable) {
            this.tui = new Tui(this.config, this);
        }

        this.postProcessQ = [];
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
            this.configdir = process.platform === "win32" ? process.env.APPDATA + "/streamdvr/" : process.env.HOME + "/.config/streamdvr/";
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
                this.log(err.toString());
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

    // Post processing is handled globally instead of per-site for easier
    // control of the number of jobs running.  Only one job at a time is
    // allowed right now, but a config option should be added to control it.
    async postProcess() {

        if (this.postProcessQ.length === 0) {
            throw new Error("post process queue is empty -- this should not happen");
        }

        // peek into queue, and pop in next()
        const capInfo     = this.postProcessQ[0];
        const site        = capInfo.site;
        const streamer    = capInfo.streamer;
        const fullname    = capInfo.filename + ".ts";
        const finalName   = capInfo.filename + "." + this.config.recording.autoConvertType;
        const completeDir = await site.getCompleteDir(streamer);

        if (this.config.recording.autoConvertType !== "mp4" && this.config.recording.autoConvertType !== "mkv") {
            site.dbgMsg(colors.name(streamer.nm) + " recording moved (" + this.config.recording.captureDirectory + "/" + capInfo.filename + ".ts to " + completeDir + "/" + capInfo.filename + ".ts)");
            mv(this.config.recording.captureDirectory + "/" + fullname, completeDir + "/" + fullname, (err) => {
                if (err) {
                    this.errMsg(colors.site(capInfo.filename) + ": " + err.toString());
                }
            });

            this.postScript(site, streamer, fullname);
            return;
        }

        site.setProcessing(streamer);

        const args = [
            this.config.recording.captureDirectory + "/" + fullname,
            completeDir + "/" + finalName,
            this.config.recording.autoConvertType
        ];

        const script = this.calcPath(this.config.recording.postprocess);

        site.infoMsg(colors.name(streamer.nm) + " converting to " + this.config.recording.autoConvertType + ": " +
            colors.cmd(script + " " + args.toString().replace(/,/g, " ")));

        const myCompleteProcess = spawn(script, args);
        site.storeCapInfo(streamer.uid, finalName);

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(this.config.recording.captureDirectory + "/" + fullname);
            }

            site.infoMsg(colors.name(streamer.nm) + " done converting " + finalName);
            this.postScript(site, streamer, finalName);
        });

        myCompleteProcess.on("error", (err) => {
            site.errMsg(err.toString());
        });
    }

    postScript(site, streamer, finalName) {
        if (this.config.postprocess) {
            const script = this.calcPath(this.config.postprocess);
            const args = [this.config.recording.completeDirectory, finalName];

            site.infoMsg(colors.name(streamer.nm) + " running global postprocess script: " +
                colors.cmd(script + " " + args.toString().replace(/,/g, " ")));
            const userPostProcess = spawn(script, args);

            userPostProcess.on("close", () => {
                site.infoMsg(colors.name(streamer.nm) + " done post-processing " + finalName);
                this.next(site, streamer);
            });
        } else {
            this.next(site, streamer);
        }
    }

    next(site, streamer) {

        site.clearProcessing(streamer);

        // Pop current job, and start next post-process job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.postProcess();
        }
    }

    async run(site) {
        await site.getStreamers({init: true});
        while (true) {
            try {
                if (this.startup) {
                    this.startup = 0;
                } else {
                    await site.disconnect();
                    await site.connect();
                }
                await site.processUpdates({add: true});
                await site.processUpdates({add: false});
                await site.getStreamers();
            } catch (err) {
                site.errMsg(err.toString());
            }
            if (site.siteConfig.scanInterval) {
                await sleep(site.siteConfig.scanInterval * 1000);
            } else {
                site.errMsg("Missing scanInterval option in " + site.cfgName + ". Using 300s instead");
                await sleep(300 * 1000);
            }
        }
    }

    start() {
        if (this.config.tui.enable) {
            this.tui.start();
        }
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

    exit() {
        // Virtual function that can be implemented by extended class
        // Should probably be using events here.  The TUI exit
        // characters trigger this.
    }

}

exports.Dvr = Dvr;
