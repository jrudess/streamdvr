"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

const TUI = require("./core/tui");

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

    if (tui.config.enableMFC) {
        const MFC = require("./plugins/mfc");
        const mfc = new MFC.Mfc(tui);
        try {
            await mfc.connect();
            runSite(mfc);
        } catch (err) {
            mfc.errMsg(err.toString());
        }
    }

    if (tui.config.enableMFCSL) {
        const MFCSL = require("./plugins/mfcsl");
        runSite(new MFCSL.Mfcsl(tui));
    }

    if (tui.config.enableCB) {
        const CB = require("./plugins/cb");
        runSite(new CB.Cb(tui));
    }

    if (tui.config.enableTwitch) {
        const TWITCH = require("./plugins/twitch");
        runSite(new TWITCH.Twitch(tui));
    }

    if (tui.config.enableMixer) {
        const MIXER = require("./plugins/mixer");
        runSite(new MIXER.Mixer(tui));
    }

    if (tui.config.enableBonga) {
        const BONGA = require("./plugins/bongacams");
        runSite(new BONGA.Bonga(tui));
    }

    if (tui.config.enableCamsoda) {
        const CAMSODA = require("./plugins/camsoda");
        runSite(new CAMSODA.Camsoda(tui));
    }

    if (tui.config.enableFC2) {
        const FC2 = require("./plugins/fc2");
        runSite(new FC2.Fc2(tui));
    }

    if (tui.config.enableCam4) {
        const CAM4 = require("./plugins/cam4");
        runSite(new CAM4.Cam4(tui));
    }

    tui.init();
}

createSites();

