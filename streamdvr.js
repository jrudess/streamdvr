"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

// 3rd Party Libraries
const Promise = require("bluebird");
const fs      = require("fs");
const yaml    = require("js-yaml");
const path    = require("path");

// local libraries
const TUI     = require("./core/tui");

const config  = yaml.safeLoad(fs.readFileSync("config.yml", "utf8"));
let logger    = null;

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
    if (typeof config.logenable !== "undefined" && config.logenable) {
        const {Console} = require("console");
        const attr = (typeof config.logappend !== "undefined" && config.logappend) ? "a" : "w";
        const logFile = fs.createWriteStream(path.resolve() + "/streamdvr.log", {flags: attr});
        logger = new Console({stdout: logFile, stderr: logFile});
    }

    const tui = new TUI.Tui(config, logger);
    tui.loadConfig();

    if (typeof config.enableMFC !== "undefined" && config.enableMFC) {
        const MFC = require("./plugins/mfc");
        const mfc = new MFC.Mfc(config, tui);
        tui.addSite(mfc);
        Promise.try(() => mfc.connect()).then(() => {
            mainSiteLoop(mfc);
        }).catch((err) => {
            mfc.errMsg(err.toString());
        });
    }

    if (typeof config.enableCB !== "undefined" && config.enableCB) {
        const CB = require("./plugins/cb");
        const cb = new CB.Cb(config, tui);
        tui.addSite(cb);
        mainSiteLoop(cb);
    }

    if (typeof config.enableTwitch !== "undefined" && config.enableTwitch) {
        const TWITCH = require("./plugins/twitch");
        const twitch = new TWITCH.Twitch(config, tui);
        tui.addSite(twitch);
        mainSiteLoop(twitch);
    }

    if (typeof config.enableMixer !== "undefined" && config.enableMixer) {
        const MIXER = require("./plugins/mixer");
        const mixer = new MIXER.Mixer(config, tui);
        tui.addSite(mixer);
        mainSiteLoop(mixer);
    }

    if (typeof config.enableBonga !== "undefined" && config.enableBonga) {
        const BONGA = require("./plugins/bongacams");
        const bonga = new BONGA.Bonga(config, tui);
        tui.addSite(bonga);
        mainSiteLoop(bonga);
    }

    if (typeof config.enableCamsoda !== "undefined" && config.enableCamsoda) {
        const CAMSODA = require("./plugins/camsoda");
        const camsoda = new CAMSODA.Camsoda(config, tui);
        tui.addSite(camsoda);
        mainSiteLoop(camsoda);
    }

    tui.initSites();
}

createSites();

