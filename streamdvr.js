"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const TUI = require("./core/tui");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

const MFC     = Symbol("Myfreecams");
// const MFCSL   = Symbol("Myfreecams with streamlink");
const CB      = Symbol("Chaturbate");
const TWITCH  = Symbol("Twitch");
const MIXER   = Symbol("Mixer");
// const BONGA   = Symbol("BongaCams");
// const CAMSODA = Symbol("Camsoda");
// const FC2     = Symbol("FC2");
// const CAM4    = Symbol("CAM4");

class Streamdvr {

    constructor() {
        this.tui = new TUI.Tui();

        this.plugins = new Map();

        this.plugins.set(MFC,     {name: "MFC",     file: "./plugins/mfc",       enable: this.tui.config.enable.MFC,     handle: null});
        // this.plugins.set(MFCSL,   {name: "MFCSL",   file: "./plugins/mfcsl",     enable: this.tui.config.enable.MFCSL,   handle: null});
        this.plugins.set(CB,      {name: "CB",      file: "./plugins/cb",        enable: this.tui.config.enable.CB,      handle: null});
        this.plugins.set(TWITCH,  {name: "TWITCH",  file: "./plugins/twitch",    enable: this.tui.config.enable.Twitch,  handle: null});
        this.plugins.set(MIXER,   {name: "MIXER",   file: "./plugins/mixer",     enable: this.tui.config.enable.Mixer,   handle: null});
        // this.plugins.set(BONGA,   {name: "BONGA",   file: "./plugins/bongacams", enable: this.tui.config.enable.Bonga,   handle: null});
        // this.plugins.set(CAMSODA, {name: "CAMSODA", file: "./plugins/camsoda",   enable: this.tui.config.enable.Camsoda, handle: null});
        // this.plugins.set(FC2,     {name: "FC2",    file: "./plugins/fc2",       enable: this.tui.config.enable.FC2,     handle: null});
        // this.plugins.set(CAM4,    {name: "CAM4",   file: "./plugins/cam4",      enable: this.tui.config.enable.Cam4,    handle: null});

        for (const [site, data] of this.plugins) {
            if (data.enable) {
                const plugin = this.plugins.get(site);
                this[site] = require(plugin.file);
                plugin.handle = new this[site].Plugin(plugin.name, this.tui);
            }
        }
    }

    async run(site) {
        while (true) {
            try {
                await site.processUpdates();
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
        this.tui.init();
    }

}

const dvr = new Streamdvr();
dvr.start();

