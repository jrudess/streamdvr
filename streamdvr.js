"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

// 3rd Party Libraries
const Promise  = require("bluebird");
const fs       = require("fs");
const util     = require("util");
const yaml     = require("js-yaml");
const path     = require("path");

// local libraries
const TUI      = require("./core/tui");
const MFC      = require("./plugins/mfc");
const CB       = require("./plugins/cb");
const TWITCH   = require("./plugins/twitch");
const MIXER    = require("./plugins/mixer");

const config   = yaml.safeLoad(fs.readFileSync("config.yml", "utf8"));
const tui      = new TUI.Tui(config);

let logFile;
if (config.tui) {
    // When stdout taken over by TUI, redirect log to a file
    logFile = fs.createWriteStream(path.resolve() + "/streamdvr.log", {flags: "w"});
    console.log = function(msg) {
        logFile.write(util.format(msg) + "\n");
    };
}

function mainSiteLoop(site) {
    Promise.try(() => site.checkFileSize(site.config.captureDirectory, site.config.maxByteSize)
    ).then(() => site.processUpdates()
    ).then((bundle) => site.updateStreamers(bundle, 1)
    ).then((bundle) => site.updateStreamers(bundle, 0)
    ).then((bundle) => site.getStreamers(bundle)
    ).then((streamers) => site.recordStreamers(streamers)
    ).catch((err) => {
        site.errMsg(err);
        // throw err;
    }).finally(() => {
        // site.dbgMsg("Done, waiting " + site.config.scanInterval + " seconds.");
        setTimeout(() => { mainSiteLoop(site); }, site.config.scanInterval * 1000);
    });
}

function createSites() {
    tui.loadConfig();

    if (typeof config.enableMFC !== "undefined" && config.enableMFC) {
        const mfc = new MFC.Mfc(config, tui);
        tui.addSite(mfc);
        Promise.try(() => mfc.connect()).then(() => {
            mainSiteLoop(mfc);
        }).catch((err) => {
            mfc.errMsg(err.toString());
        });
    }

    if (typeof config.enableCB !== "undefined" && config.enableCB) {
        const cb = new CB.Cb(config, tui);
        tui.addSite(cb);
        mainSiteLoop(cb);
    }

    if (typeof config.enableTwitch !== "undefined" && config.enableTwitch) {
        const twitch = new TWITCH.Twitch(config, tui);
        tui.addSite(twitch);
        mainSiteLoop(twitch);
    }

    if (typeof config.enableMixer !== "undefined" && config.enableMixer) {
        const mixer = new MIXER.Mixer(config, tui);
        tui.addSite(mixer);
        mainSiteLoop(mixer);
    }

    tui.initSites();
}

createSites();

