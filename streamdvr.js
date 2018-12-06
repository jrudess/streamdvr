"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const fs      = require("fs");
const mv      = require("mv");
const colors  = require("colors/safe");
const yaml    = require("js-yaml");
const path    = require("path");
const {spawn} = require("child_process");
const {Tui}   = require("./core/tui");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

const MFC     = Symbol("Myfreecams");
const CB      = Symbol("Chaturbate");
const PIXIV   = Symbol("Pixiv");
const TWITCH  = Symbol("Twitch");
const MIXER   = Symbol("Mixer");
const YOUTUBE = Symbol("Youtube");
const FC2     = Symbol("FC2");
// const MFCSL   = Symbol("Myfreecams with streamlink");
// const BONGA   = Symbol("BongaCams");
// const CAMSODA = Symbol("Camsoda");
// const CAM4    = Symbol("CAM4");

class Streamdvr {

    constructor() {

        this.tryingToExit = false;

        this.configdir = "";
        this.configfile = this.findConfig();

        this.config = null;
        this.loadConfig();

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
        this.plugins = new Map();

        this.plugins.set(MFC,     {name: "MFC",     file: "./plugins/mfc",   urlback: "",       enable: this.config.enable.MFC,     handle: null});
        this.plugins.set(CB,      {name: "CB",      file: "./plugins/basic", urlback: "",       enable: this.config.enable.CB,      handle: null});
        this.plugins.set(PIXIV,   {name: "PIXIV",   file: "./plugins/basic", urlback: "/lives", enable: this.config.enable.Pixiv,   handle: null});
        this.plugins.set(TWITCH,  {name: "TWITCH",  file: "./plugins/basic", urlback: "",       enable: this.config.enable.Twitch,  handle: null});
        this.plugins.set(MIXER,   {name: "MIXER",   file: "./plugins/basic", urlback: "",       enable: this.config.enable.Mixer,   handle: null});
        this.plugins.set(YOUTUBE, {name: "YOUTUBE", file: "./plugins/basic", urlback: "",       enable: this.config.enable.Youtube, handle: null});
        this.plugins.set(FC2,     {name: "FC2",     file: "./plugins/basic", urlback: "",       enable: this.config.enable.FC2,     handle: null});
        // this.plugins.set(MFCSL,   {name: "MFCSL",   file: "./plugins/basic", urlback: "",       enable: this.config.enable.MFCSL,   handle: null});
        // this.plugins.set(BONGA,   {name: "BONGA",   file: "./plugins/basic", urlback: "",       enable: this.config.enable.Bonga,   handle: null});
        // this.plugins.set(CAMSODA, {name: "CAMSODA", file: "./plugins/basic", urlback: "",       enable: this.config.enable.Camsoda, handle: null});
        // this.plugins.set(CAM4,    {name: "CAM4",    file: "./plugins/basic", urlback: "",       enable: this.config.enable.Cam4,    handle: null});

        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site);
                this[site] = require(plugin.file);
                plugin.handle = new this[site].Plugin(plugin.name, this, this.tui, plugin.urlback);
            }
        }

        process.on("SIGINT", () => {
            this.exit();
        });
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

        if (this.config.tui.enable && this.tui.list) {
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

        site.msg(colors.name(streamer.nm) + " converting to " + this.config.recording.autoConvertType + ": " + colors.cmd("scripts/postprocess_ffmpeg.sh " + args.toString().replace(/,/g, " ")));
        const myCompleteProcess = spawn("scripts/postprocess_ffmpeg.sh", args);
        site.storeCapInfo(streamer.uid, finalName);

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(this.config.recording.captureDirectory + "/" + fullname);
            }

            site.msg(colors.name(streamer.nm) + " done converting " + finalName);
            this.postScript(site, streamer, finalName);
        });

        myCompleteProcess.on("error", (err) => {
            site.errMsg(err.toString());
        });
    }

    postScript(site, streamer, finalName) {
        if (this.config.postprocess) {
            const args = [this.config.recording.completeDirectory, finalName];
            const userPostProcess = spawn(this.config.postprocess, args, {windowsVerbatimArguments: true});

            userPostProcess.on("close", () => {
                site.msg(colors.name(streamer.nm) + " done post-processing " + finalName);
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
                await site.processUpdates({add: true});
                await site.processUpdates({add: false});
                await site.getStreamers();
            } catch (err) {
                site.errMsg(err.toString());
            }
            if (site.siteConfig.scanInterval) {
                await sleep(site.siteConfig.scanInterval * 1000);
            } else {
                site.errMsg("Missing scanInterval option in " + site.cfgname + ". Using 300s instead");
                await sleep(300 * 1000);
            }
        }
    }

    async start() {
        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site).handle;
                await plugin.connect();
                this.run(plugin);
            }
        }
        if (this.config.tui.enable) {
            this.tui.init();
        }
    }

    log(text, options) {
        if (this.config.tui.enable) {
            this.tui.log(text);
        } else if (options && options.trace && this.config.debug.errortrace) {
            console.trace(text);
        } else {
            console.log(text);
        }
        if (this.logger) {
            this.logger.log(text);
        }
    }

    busy() {
        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site);
                if (plugin.handle.getNumCapsInProgress() > 0) {
                    return true;
                }
            }
        }
        return false;
    }

    async tryExit() {
        while (true) {
            // delay exiting until all capture and postprocess
            // ffmpeg jobs have completed.
            if (!this.busy()) {
                for (const [site, data] of this.plugins) {
                    if (data.enable) {
                        const plugin = this.plugins.get(site);
                        await plugin.handle.disconnect();
                    }
                }
                process.exit(0);
            } else {
                await sleep(1000);
            }
        }
    }

    exit() {
        // Prevent bad things from happening if user holds down ctrl+c
        if (!this.tryingToExit) {
            this.tryingToExit = true;
            if (this.busy()) {
                this.log("Stopping all recordings...");
            }
            this.tryExit();
        }

        // Allow this to execute multiple times so that SIGINT
        // can get passed again to ffmpeg/streamdvr in case some get hung.
        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site);
                plugin.handle.haltAllCaptures();
            }
        }
    }

}

const dvr = new Streamdvr();
dvr.start();

