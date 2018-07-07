"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const Promise = require("bluebird");
const TUI     = require("./core/tui");

function mainSiteLoop(site) {
    Promise.try(() => site.checkFileSize()
    ).then(() => site.processUpdates()
    ).then((bundle) => site.updateStreamers(bundle, 1)
    ).then((bundle) => site.updateStreamers(bundle, 0)
    ).then((bundle) => site.getStreamers(bundle)
    ).catch((err) => {
        site.errMsg(err.toString());
    }).finally(() => {
        // site.dbgMsg("Done, waiting " + site.config.scanInterval + " seconds.");
        setTimeout(() => { mainSiteLoop(site); }, site.tui.config.scanInterval * 1000);
    });
}

function createSites() {
    const tui = new TUI.Tui();

    if (typeof tui.config.enableMFC !== "undefined" && tui.config.enableMFC) {
        const MFC = require("./plugins/mfc");
        const mfc = new MFC.Mfc(tui);
        Promise.try(() => mfc.connect()).then(() => {
            mainSiteLoop(mfc);
        }).catch((err) => {
            mfc.errMsg(err.toString());
        });
    }

    if (typeof tui.config.enableMFCSL !== "undefined" && tui.config.enableMFCSL) {
        const MFCSL = require("./plugins/mfcsl");
        mainSiteLoop(new MFCSL.Mfcsl(tui));
    }

    if (typeof tui.config.enableCB !== "undefined" && tui.config.enableCB) {
        const CB = require("./plugins/cb");
        mainSiteLoop(new CB.Cb(tui));
    }

    if (typeof tui.config.enableTwitch !== "undefined" && tui.config.enableTwitch) {
        const TWITCH = require("./plugins/twitch");
        mainSiteLoop(new TWITCH.Twitch(tui));
    }

    if (typeof tui.config.enableMixer !== "undefined" && tui.config.enableMixer) {
        const MIXER = require("./plugins/mixer");
        mainSiteLoop(new MIXER.Mixer(tui));
    }

    if (typeof tui.config.enableBonga !== "undefined" && tui.config.enableBonga) {
        const BONGA = require("./plugins/bongacams");
        mainSiteLoop(new BONGA.Bonga(tui));
    }

    if (typeof tui.config.enableCamsoda !== "undefined" && tui.config.enableCamsoda) {
        const CAMSODA = require("./plugins/camsoda");
        mainSiteLoop(new CAMSODA.Camsoda(tui));
    }

    if (typeof tui.config.enableFC2 !== "undefined" && tui.config.enableFC2) {
        const FC2 = require("./plugins/fc2");
        mainSiteLoop(new FC2.Fc2(tui));
    }

    if (typeof tui.config.enableCam4 !== "undefined" && tui.config.enableCam4) {
        const CAM4 = require("./plugins/cam4");
        mainSiteLoop(new CAM4.Cam4(tui));
    }

    tui.init();
}

createSites();

