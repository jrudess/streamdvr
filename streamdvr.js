"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const fs    = require("fs");
const yaml  = require("js-yaml");
const {Dvr} = require("./core/dvr");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class Streamdvr extends Dvr {

    constructor() {
        super();
        this.plugins = [];

        // Scan the config.yml directory for plugins to load
        const allfiles = fs.readdirSync(this.configdir);
        const ymlfiles = allfiles.filter((x) => x.match(/.*\.yml/ig) && !x.match(/.*_updates\.yml/ig) && x !== "config.yml");

        for (let i = 0; i < ymlfiles.length; i++) {
            const siteConfig = yaml.safeLoad(fs.readFileSync(this.configdir + ymlfiles[i], "utf8"));
            if (typeof siteConfig.plugin !== "undefined" && siteConfig.enable) {
                this.plugins.push({
                    code:    require(siteConfig.plugin),
                    name:    siteConfig.name,
                    file:    siteConfig.plugin,
                    urlback: siteConfig.urlback,
                    enable:  siteConfig.enable,
                    handle:  null
                });
            }
        }

        for (let i = 0; i < this.plugins.length; i++) {
            this.plugins[i].handle = new this.plugins[i].code.Plugin(this.plugins[i].name, this, this.tui, this.plugins[i].urlback);
        }

        process.on("SIGINT", () => {
            this.exit();
        });
    }

    async start() {
        for (let i = 0; i < this.plugins.length; i++) {
            if (this.plugins[i].enable) {
                await this.plugins[i].handle.connect();
                this.run(this.plugins[i].handle);
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

