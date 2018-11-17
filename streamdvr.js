"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const TUI = require("./core/tui");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

const MFC     = Symbol("Myfreecams");
const MFCSL   = Symbol("Myfreecams with streamlink");
const CB      = Symbol("Chaturbate");
const TWITCH  = Symbol("Twitch");
const MIXER   = Symbol("Mixer");
const BONGA   = Symbol("BongaCams");
const CAMSODA = Symbol("Camsoda");
const FC2     = Symbol("FC2");
const CAM4    = Symbol("CAM4");

class Streamdvr {

    constructor() {
        this.tui = new TUI.Tui();

        this.plugins = new Map();

        this.plugins.set(MFC,     {file: "./plugins/mfc",     enable: this.tui.config.enableMFC,     handle: null});
        this.plugins.set(MFCSL,   {file: "./plugins/mfcsl",   enable: this.tui.config.enableMFCSL,   handle: null});
        this.plugins.set(CB,      {file: "./plugins/cb",      enable: this.tui.config.enableCB,      handle: null});
        this.plugins.set(TWITCH,  {file: "./plugins/twitch",  enable: this.tui.config.enableTwitch,  handle: null});
        this.plugins.set(MIXER,   {file: "./plugins/mixer",   enable: this.tui.config.enableMixer,   handle: null});
        this.plugins.set(BONGA,   {file: "./plugins/bonga",   enable: this.tui.config.enableBonga,   handle: null});
        this.plugins.set(CAMSODA, {file: "./plugins/camsoda", enable: this.tui.config.enableCamsoda, handle: null});
        this.plugins.set(FC2,     {file: "./plugins/fc2",     enable: this.tui.config.enableFC2,     handle: null});
        this.plugins.set(CAM4,    {file: "./plugins/cam4",    enable: this.tui.config.enableCam4,    handle: null});

        for (const [site, data] of this.plugins) {
            if (data.enable) {
                this[site] = require(this.plugins.get(site).file);
                this.plugins.get(site).handle = new this[site].Plugin(this.tui);
            }
        }
    }

    async runSite(site) {
        while (true) {
            try {
                await site.processUpdates();
                await site.getStreamers();
            } catch (err) {
                site.errMsg(err.toString());
            }
            await sleep(site.tui.config.scanInterval * 1000);
        }
    }

    async start() {

        for (const [site, data] of this.plugins) {
            if (data.enable) {
                if (site === MFC) {
                    await this.plugins.get(site).handle.connect();
                }
                this.runSite(this.plugins.get(site).handle);
            }
        }

        this.tui.init();
    }

}

const dvr = new Streamdvr();
dvr.start();

