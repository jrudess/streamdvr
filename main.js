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

let total = 0;
let inst = 1;
if (config.enableMFC) {
    total++;
}
if (config.enableCB) {
    total++;
}
if (config.enableTwitch) {
    total++;
}

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

function showlist() {
    for (let i = 0; i < SITES.length; i++) {
        SITES[i].show();
    }
    logbody.top = "66%";
    logbody.height = "34%";
}

function hidelist() {
    for (let i = 0; i < SITES.length; i++) {
        SITES[i].hide();
    }
    logbody.top = 0;
    logbody.height = "100%-1";
}

function showlog() {
    logbody.show();
    for (let i = 0; i < SITES.length; i++) {
        SITES[i].restore();
    }
}

function hidelog() {
    logbody.hide();
    for (let i = 0; i < SITES.length; i++) {
        SITES[i].full();
    }
}

inputBar.on("submit", (text) => {
    if (text === "hide list") {
        hidelist();
    } else if (text === "show list") {
        showlist();
    } else if (text === "hide log") {
        hidelog();
    } else if (text === "show log") {
        showlog();
    } else if (text === "help") {
        logbody.pushLine("Commands:");
        logbody.pushLine("show [log|list]");
        logbody.pushLine("hide [log|list]");
        logbody.setScrollPerc(100);
    }
    inputBar.clearValue();
    screen.render();
});

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function mainSiteLoop(site) {

    Promise.try(function() {
        site.checkFileSize(config.captureDirectory, config.maxByteSize);
    }).then(function() {
        return site.processUpdates();
    }).then(function(bundle) {
        return site.addStreamers(bundle);
    }).then(function(bundle) {
        return site.removeStreamers(bundle);
    }).then(function(dirty) {
        return site.writeConfig(dirty);
    }).then(function() {
        return site.getStreamersToCap();
    }).then(function(streamersToCap) {
        return site.recordStreamers(streamersToCap, tryingToExit);
    }).catch(function(err) {
        site.errMsg(err);
    }).finally(function() {
        site.dbgMsg("Done, waiting " + config.scanInterval + " seconds.");
        setTimeout(function() { mainSiteLoop(site); }, config.scanInterval * 1000);
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

process.on("SIGINT", function() {
    exit();
});

config.captureDirectory  = path.resolve(config.captureDirectory);
config.completeDirectory = path.resolve(config.completeDirectory);

mkdirp(config.captureDirectory, function(err) {
    if (err) {
        log(err.toString());
        process.exit(1);
    }
});

mkdirp(config.completeDirectory, function(err) {
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
    Promise.try(function() {
        return mfc.connect();
    }).then(function() {
        mainSiteLoop(mfc);
    }).catch(function(err) {
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
    hidelist();
}

if (!config.logshown) {
    hidelog();
}

screen.append(logbody);
screen.append(inputBar);

screen.render();

// Have to render screen once before printouts work
if (config.enableMFC) {
    mfc.msg(config.mfc.length + " streamer(s) in config");
}
if (config.enableCB) {
    cb.msg(config.cb.length + " streamer(s) in config");
}
if (config.enableTwitch) {
    twitch.msg(config.twitch.length + " streamer(s) in config");
}
