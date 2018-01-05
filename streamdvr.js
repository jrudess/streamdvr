"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

// 3rd Party Libraries
const Promise  = require("bluebird");
const fs       = require("fs");
const util     = require("util");
const yaml     = require("js-yaml");
const path     = require("path");

// local libraries
const TUI      = require("./tui");
const MFC      = require("./mfc");
const CB       = require("./cb");
const TWITCH   = require("./twitch");

const logFile  = fs.createWriteStream(path.resolve() + "/streamdvr.log", {flags: "w"});
const config   = yaml.safeLoad(fs.readFileSync("config.yml", "utf8"));
const tui      = new TUI.Tui(config);

console.log = function(msg) {
    logFile.write(util.format(msg) + "\n");
};

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
        site.dbgMsg("Done, waiting " + site.config.scanInterval + " seconds.");
        setTimeout(() => { mainSiteLoop(site); }, site.config.scanInterval * 1000);
    });
}

function createSites() {
    tui.loadConfig();

    if (config.enableMFC) {
        const mfc = new MFC.Mfc(config, tui);
        tui.addSite(mfc);
        Promise.try(() => mfc.connect()).then(() => {
            mainSiteLoop(mfc);
        }).catch((err) => {
            mfc.errMsg(err);
            return err;
        });
    }

    if (config.enableCB) {
        const cb = new CB.Cb(config, tui);
        tui.addSite(cb);
        mainSiteLoop(cb);
    }

    if (config.enableTwitch) {
        const twitch = new TWITCH.Twitch(config, tui);
        tui.addSite(twitch);
        mainSiteLoop(twitch);
    }

    tui.initSites();
}

createSites();

