"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const fs      = require("fs");
const mv      = require("mv");
const colors  = require("colors/safe");
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
        this.tui = new Tui();

        this.postProcessQ = [];
        this.plugins = new Map();

        this.plugins.set(MFC,     {name: "MFC",     file: "./plugins/mfc",   urlback: "",       enable: this.tui.config.enable.MFC,     handle: null});
        this.plugins.set(CB,      {name: "CB",      file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.CB,      handle: null});
        this.plugins.set(PIXIV,   {name: "PIXIV",   file: "./plugins/basic", urlback: "/lives", enable: this.tui.config.enable.Pixiv,   handle: null});
        this.plugins.set(TWITCH,  {name: "TWITCH",  file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Twitch,  handle: null});
        this.plugins.set(MIXER,   {name: "MIXER",   file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Mixer,   handle: null});
        this.plugins.set(YOUTUBE, {name: "YOUTUBE", file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Youtube, handle: null});
        this.plugins.set(FC2,     {name: "FC2",     file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.FC2,     handle: null});
        // this.plugins.set(MFCSL,   {name: "MFCSL",   file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.MFCSL,   handle: null});
        // this.plugins.set(BONGA,   {name: "BONGA",   file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Bonga,   handle: null});
        // this.plugins.set(CAMSODA, {name: "CAMSODA", file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Camsoda, handle: null});
        // this.plugins.set(CAM4,    {name: "CAM4",    file: "./plugins/basic", urlback: "",       enable: this.tui.config.enable.Cam4,    handle: null});

        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site);
                this[site] = require(plugin.file);
                plugin.handle = new this[site].Plugin(plugin.name, this, this.tui, plugin.urlback);
            }
        }
    }

    async postProcess() {

        if (this.postProcessQ.length === 0) {
            throw new Error("post process queue is empty -- this should not happen");
        }

        // peek into queue, and pop in next()
        const capInfo     = this.postProcessQ[0];
        const site        = capInfo.site;
        const streamer    = capInfo.streamer;
        const fullname    = capInfo.filename + ".ts";
        const finalName   = capInfo.filename + "." + this.tui.config.recording.autoConvertType;
        const completeDir = await site.getCompleteDir(streamer);

        if (this.tui.config.recording.autoConvertType !== "mp4" && this.tui.config.recording.autoConvertType !== "mkv") {
            site.dbgMsg(colors.name(streamer.nm) + " recording moved (" + this.tui.config.recording.captureDirectory + "/" + capInfo.filename + ".ts to " + completeDir + "/" + capInfo.filename + ".ts)");
            mv(this.tui.config.recording.captureDirectory + "/" + fullname, completeDir + "/" + fullname, (err) => {
                if (err) {
                    this.errMsg(colors.site(capInfo.filename) + ": " + err.toString());
                }
            });

            this.postScript(site, streamer, fullname);
            return;
        }

        site.setProcessing(streamer);

        const args = [
            this.tui.config.recording.captureDirectory + "/" + fullname,
            completeDir + "/" + finalName,
            this.tui.config.recording.autoConvertType
        ];

        site.msg(colors.name(streamer.nm) + " converting to " + this.tui.config.recording.autoConvertType + ": " + colors.cmd("scripts/postprocess_ffmpeg.sh " + args.toString().replace(/,/g, " ")));
        const myCompleteProcess = spawn("scripts/postprocess_ffmpeg.sh", args);
        site.storeCapInfo(streamer.uid, finalName);

        myCompleteProcess.on("close", () => {
            if (!this.tui.config.recording.keepTsFile) {
                fs.unlinkSync(this.tui.config.recording.captureDirectory + "/" + fullname);
            }

            site.msg(colors.name(streamer.nm) + " done converting " + finalName);
            this.postScript(site, streamer, finalName);
        });

        myCompleteProcess.on("error", (err) => {
            site.errMsg(err.toString());
        });
    }

    postScript(site, streamer, finalName) {
        if (this.tui.config.postprocess) {
            const args = [this.tui.config.recording.completeDirectory, finalName];
            const userPostProcess = spawn(this.tui.config.postprocess, args, {windowsVerbatimArguments: true});

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
        while (true) {
            try {
                await site.processUpdates({add: true});
                await site.getStreamers();
                await site.processUpdates({add: false});
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
        this.tui.init();
    }

}

const dvr = new Streamdvr();
dvr.start();

