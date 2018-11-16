"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

// const Promise = require("bluebird");
const TUI     = require("./core/tui");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function runSite(site) {
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

async function createSites() {
    const tui = new TUI.Tui();

    if (typeof tui.config.enableMFC !== "undefined" && tui.config.enableMFC) {
        const MFC = require("./plugins/mfc");
        const mfc = new MFC.Mfc(tui);
        try {
            await mfc.connect();
            runSite(mfc);
        } catch (err) {
            mfc.errMsg(err.toString());
        }
    }

    if (typeof tui.config.enableMFCSL !== "undefined" && tui.config.enableMFCSL) {
        const MFCSL = require("./plugins/mfcsl");
        runSite(new MFCSL.Mfcsl(tui));
    }

    if (typeof tui.config.enableCB !== "undefined" && tui.config.enableCB) {
        const CB = require("./plugins/cb");
        runSite(new CB.Cb(tui));
    }

    if (typeof tui.config.enableTwitch !== "undefined" && tui.config.enableTwitch) {
        const TWITCH = require("./plugins/twitch");
        runSite(new TWITCH.Twitch(tui));
    }

    if (typeof tui.config.enableMixer !== "undefined" && tui.config.enableMixer) {
        const MIXER = require("./plugins/mixer");
        runSite(new MIXER.Mixer(tui));
    }

    if (typeof tui.config.enableBonga !== "undefined" && tui.config.enableBonga) {
        const BONGA = require("./plugins/bongacams");
        runSite(new BONGA.Bonga(tui));
    }

    if (typeof tui.config.enableCamsoda !== "undefined" && tui.config.enableCamsoda) {
        const CAMSODA = require("./plugins/camsoda");
        runSite(new CAMSODA.Camsoda(tui));
    }

    if (typeof tui.config.enableFC2 !== "undefined" && tui.config.enableFC2) {
        const FC2 = require("./plugins/fc2");
        runSite(new FC2.Fc2(tui));
    }

    if (typeof tui.config.enableCam4 !== "undefined" && tui.config.enableCam4) {
        const CAM4 = require("./plugins/cam4");
        runSite(new CAM4.Cam4(tui));
    }

    tui.init();
}

createSites();

