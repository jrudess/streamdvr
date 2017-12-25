"use strict";

require("events").EventEmitter.prototype._maxListeners = 100;

// 3rd Party Libraries
const Promise    = require("bluebird");
const fs         = require("fs");
const util       = require("util");
const yaml       = require("js-yaml");
const mkdirp     = require("mkdirp");
const colors     = require("colors/safe");
const path       = require("path");
const blessed    = require("blessed");

// local libraries
const MFC        = require("./mfc");
const CB         = require("./cb");
const TWITCH     = require("./twitch");

let tryingToExit = 0;
const config     = yaml.safeLoad(fs.readFileSync("config.yml", "utf8"));

let mfc = null;
let cb = null;
let twitch = null;
const SITES = [];

const logFile = fs.createWriteStream(path.resolve() + "/streamdvr.log", {flags: "w"});

console.log = function(msg) {
    logFile.write(util.format(msg) + "\n");
};

const total = Number(config.enableMFC) + Number(config.enableCB) + Number(config.enableTwitch);
let inst = 1;

const screen = blessed.screen();
const logbody = blessed.box({
    top: "66%",
    left: 0,
    height: "34%",
    width: "100%",
    keys: true,
    mouse: true,
    alwaysScroll: true,
    scrollable: true,
    scrollbar: {
        ch: " ",
        bg: "red"
    }
});
const inputBar = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 1,
    width: "100%",
    keys: true,
    mouse: true,
    inputOnFocus: true,
    style: {
        fg: "white",
        bg: "blue"
    }
});

// Add text to body (replacement for console.log)
function log(text) {
    logbody.pushLine(text);
    screen.render();
    console.log(text);
}

// Runtime UI adjustments
function display(cmd, window) {
    switch (window) {
    case "list":
        for (let i = 0; i < SITES.length; i++) {
            switch (cmd) {
            case "show": SITES[i].show(); break;
            case "hide": SITES[i].hide(); break;
            }
        }
        switch (cmd) {
        case "show": logbody.top = "66%"; logbody.height = "34%";    break;
        case "hide": logbody.top = 0;     logbody.height = "100%-1"; break;
        }
        break;
    case "log":
        switch (cmd) {
        case "show": logbody.show(); break;
        case "hide": logbody.hide(); break;
        }
        for (let i = 0; i < SITES.length; i++) {
            switch (cmd) {
            case "show": SITES[i].restore(); break;
            case "hide": SITES[i].full();    break;
            }
        }
        break;
    }
}

// Add and remove streamers
function updateList(cmd, site, nm) {
    for (let i = 0; i < SITES.length; i++) {
        const siteName = SITES[i].siteName.trim().toLowerCase();
        if (site === siteName) {
            SITES[i].updateList(nm, cmd === "add" ? 1 : 0).then((update) => {
                if (update) {
                    SITES[i].writeConfig();
                }
            });
        }
    }
}

// CLI
inputBar.on("submit", (text) => {
    inputBar.clearValue();

    const tokens = text.split(" ");
    if (tokens.length === 0) {
        screen.render();
        return;
    }

    switch (tokens[0]) {
    case "add":
    case "remove":
        if (tokens.length >= 3) {
            updateList(tokens[0], tokens[1], tokens[2]);
        }
        break;

    case "show":
    case "hide":
        if (tokens.length >= 2) {
            display(tokens[0], tokens[1]);
        }
        break;

    case "help":
        logbody.pushLine("Commands:");
        logbody.pushLine("add    [site] [streamer]");
        logbody.pushLine("remove [site] [streamer]");
        logbody.pushLine("show   [log|list]");
        logbody.pushLine("hide   [log|list]");
        logbody.setScrollPerc(100);
        break;
    }
    screen.render();
});

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function mainSiteLoop(site) {

    Promise.try(() => {
        site.checkFileSize(config.captureDirectory, config.maxByteSize);
    }).then(() =>
        site.processUpdates()
    ).then((bundle) =>
        site.updateStreamers(bundle, 1)
    ).then((bundle) =>
        site.updateStreamers(bundle, 0)
    ).then((bundle) => {
        let streamersToCap = [];
        if (bundle.dirty) {
            site.writeConfig();
        }
        if (tryingToExit) {
            site.dbgMsg("Skipping lookup while exit in progress...");
        } else {
            streamersToCap = site.getStreamersToCap();
        }
        return streamersToCap;
    }).then((streamersToCap) =>
        site.recordStreamers(streamersToCap)
    ).catch((err) => {
        site.errMsg(err);
    }).finally(() => {
        site.dbgMsg("Done, waiting " + config.scanInterval + " seconds.");
        setTimeout(() => { mainSiteLoop(site); }, config.scanInterval * 1000);
    });
}

function busy() {
    let capsInProgress = 0;
    let semaphore = 0;

    for (let i = 0; i < SITES.length; i++) {
        capsInProgress += SITES[i].getNumCapsInProgress();
        semaphore      += SITES[i].semaphore;
    }
    return semaphore > 0 || capsInProgress > 0;
}

function tryExit() {
    // delay exiting until ffmpeg process ends and
    // postprocess jobs finish.
    if (!busy()) {
        if (config.enableMFC) {
            mfc.disconnect();
        }
        process.exit(0);
    } else {
        sleep(1000).then(() => {
            tryExit(); // recursion!
        });
    }
}

function exit() {
    // Prevent bad things from happening if user holds down ctrl+c
    if (!tryingToExit) {
        tryingToExit = 1;
        if (busy()) {
            log("Waiting for ffmpeg captures to terminate.");
        }
        tryExit();
    }

    // Allow this to execute multiple times so that SIGINT
    // can get passed again to ffmpeg in case some get hung.
    if (busy()) {
        for (let i = 0; i < SITES.length; i++) {
            SITES[i].haltAllCaptures();
        }
    }
}

screen.key("enter", () => {
    inputBar.focus();
});

// Close on q, or ctrl+c
// Note: screen intercepts ctrl+c and it does not pass down to ffmpeg
screen.key(["q", "C-c"], () => (
    exit()
));

process.on("SIGINT", () => {
    exit();
});

config.captureDirectory  = path.resolve(config.captureDirectory);
config.completeDirectory = path.resolve(config.completeDirectory);

mkdirp(config.captureDirectory, (err) => {
    if (err) {
        log(err.toString());
        process.exit(1);
    }
});

mkdirp(config.completeDirectory, (err) => {
    if (err) {
        log(err.toString());
        process.exit(1);
    }
});

colors.setTheme({
    name:    config.namecolor,
    state:   config.statecolor,
    offline: config.offlinecolor,
    file:    config.filecolor,
    time:    config.timecolor,
    site:    config.sitecolor,
    debug:   config.debugcolor,
    error:   config.errorcolor
});

if (config.enableMFC) {
    mfc = new MFC.Mfc(config, screen, logbody, inst, total);
    inst++;
    SITES.push(mfc);
    Promise.try(() => mfc.connect()).then(() => {
        mainSiteLoop(mfc);
    }).catch((err) => {
        mfc.errMsg(err);
        return err;
    });
}

if (config.enableCB) {
    cb = new CB.Cb(config, screen, logbody, inst, total);
    inst++;
    SITES.push(cb);
    mainSiteLoop(cb);
}

if (config.enableTwitch) {
    twitch = new TWITCH.Twitch(config, screen, logbody, inst, total);
    inst++;
    SITES.push(twitch);
    mainSiteLoop(twitch);
}

if (!config.listshown) {
    display("hide", "list");
}

if (!config.logshown) {
    display("hide", "log");
}

screen.append(logbody);
screen.append(inputBar);

// Have to render screen once before printouts work
screen.render();

if (config.enableMFC) {
    mfc.msg(config.mfc.length + " streamer(s) in config");
}
if (config.enableCB) {
    cb.msg(config.cb.length + " streamer(s) in config");
}
if (config.enableTwitch) {
    twitch.msg(config.twitch.length + " streamer(s) in config");
}
