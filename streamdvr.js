"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const {Dvr} = require("./core/dvr");

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

class Streamdvr extends Dvr {

    constructor() {
        super();
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

        for (const [site, plugin] of this.plugins) {
            if (plugin.enable) {
                this[site] = require(plugin.file);
                plugin.handle = new this[site].Plugin(plugin.name, this, this.tui, plugin.urlback);
            }
        }

        process.on("SIGINT", () => {
            this.exit();
        });
    }

    async start() {
        for (const plugin of this.plugins.values()) {
            if (plugin.enable) {
                await plugin.handle.connect();
                this.run(plugin.handle);
            }
        }
        super.start();
    }

    busy() {
        for (const plugin of this.plugins.values()) {
            if (plugin.enable) {
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
                for (const plugin of this.plugins.values()) {
                    if (plugin.enable) {
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
        for (const plugin of this.plugins.values()) {
            if (plugin.enable) {
                plugin.handle.haltAllCaptures();
            }
        }
    }

}

const dvr = new Streamdvr();
dvr.start();

