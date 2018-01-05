const blessed = require("blessed");
const colors  = require("colors/safe");
const fs      = require("fs");
const mkdirp  = require("mkdirp");
const path    = require("path");
const yaml    = require("js-yaml");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class Tui {
    constructor(config) {
        // Handle to the cross-site config.yml
        this.config = config;

        this.total = Number(config.enableMFC) + Number(config.enableCB) + Number(config.enableTwitch);

        this.screen = blessed.screen({smartCSR: true});
        this.screen.title = "streamdvr";

        this.SITES = [];
        this.tryingToExit = 0;

        this.logbody = blessed.box({
            top: "66%",
            left: 0,
            height: "34%",
            width: "100%",
            keys: true,
            mouse: false,
            alwaysScroll: true,
            scrollable: true,
            scrollbar: {
                ch: " ",
                bg: "blue"
            }
        });

        this.inputBar = blessed.textbox({
            bottom: 0,
            left: 0,
            height: 1,
            width: "100%",
            keys: true,
            mouse: false,
            inputOnFocus: true,
            style: {
                fg: "white",
                bg: "none"
            }
        });

        this.screen.key("pageup", () => {
            this.screen.focused.scroll(-this.screen.focused.height || -1);
            this.render();
        });

        this.screen.key("pagedown", () => {
            this.screen.focused.scroll(this.screen.focused.height || 1);
            this.render();
        });

        this.screen.key("enter", () => {
            this.inputBar.focus();
        });

        // Close on q, or ctrl+c
        // Note: tui.screen intercepts ctrl+c and it does not pass down to ffmpeg
        this.screen.key(["q", "C-c"], () => (
            this.exit()
        ));

        this.inputBar.key(["C-c"], () => (
            this.ext()
        ));

        process.on("SIGINT", () => {
            this.exit();
        });

        this.screen.append(this.logbody);
        this.screen.append(this.inputBar);
        this.logbody.focus();

        // CLI
        this.inputBar.on("submit", (text) => {
            this.inputBar.clearValue();

            const tokens = text.split(" ");
            if (tokens.length === 0) {
                this.render();
                return;
            }

            switch (tokens[0]) {
            case "add":
            case "addtemp":
            case "remove":
                if (tokens.length >= 3) {
                    this.updateList(tokens[0], tokens[1], tokens[2], tokens[0] === "addtemp");
                }
                break;

            case "reload":
                this.loadConfig();
                break;

            case "show":
            case "hide":
                if (tokens.length >= 2) {
                    this.display(tokens[0], tokens[1]);
                }
                break;

            case "help":
                this.logbody.pushLine("Commands:");
                this.logbody.pushLine("add     [site] [streamer]");
                this.logbody.pushLine("addtemp [site] [streamer]");
                this.logbody.pushLine("remove  [site] [streamer]");
                this.logbody.pushLine("reload");
                this.logbody.pushLine("show    [log|list]");
                this.logbody.pushLine("hide    [log|list]");
                this.logbody.setScrollPerc(100);
                break;
            }
            this.logbody.focus();
        });
    }

    addSite(site) {
        this.SITES.push(site);
    }

    // Called after SITES is populated
    initSites() {
        const hotkeys = ["1", "2", "3", "4"];
        for (let i = 0; i < hotkeys.length && i < this.SITES.length; i++) {
            this.screen.key(hotkeys[i], () => {
                this.SITES[i].list.focus();
            });
        }

        for (let i = 0; i < this.SITES.length; i++) {
            const siteName = this.SITES[i].listName;
            if ((this.config.enableMFC      && siteName === "mfc") ||
                (this.config.enableCB       && siteName === "cb") ||
                (this.config.enableTwitch   && siteName === "twitch")) {

                this.SITES[i].msg(this.SITES[i].siteConfig.streamers.length + " streamer(s) in config");
            }
        }
    }

    log(text) {
        this.logbody.pushLine(text);
        this.logbody.setScrollPerc(100);
        this.render();
        console.log(text);
    }

    render() {
        if (typeof this.screen !== "undefined") {
            this.screen.render();
        }
    }

    // Runtime UI adjustments
    display(cmd, window) {
        switch (window) {
        case "list":
            for (let i = 0; i < this.SITES.length; i++) {
                switch (cmd) {
                case "show": this.SITES[i].show(); break;
                case "hide": this.SITES[i].hide(); break;
                }
            }
            switch (cmd) {
            case "show": this.logbody.top = "66%"; this.logbody.height = "34%";    break;
            case "hide": this.logbody.top = 0;     this.logbody.height = "100%-1"; break;
            }
            break;
        case "log":
            switch (cmd) {
            case "show": this.logbody.show(); break;
            case "hide": this.logbody.hide(); break;
            }
            for (let i = 0; i < this.SITES.length; i++) {
                switch (cmd) {
                case "show": this.SITES[i].restore(); break;
                case "hide": this.SITES[i].full();    break;
                }
            }
            break;
        }
        this.render();
    }

    // Add and remove streamers
    updateList(cmd, site, nm, isTemp) {
        for (let i = 0; i < this.SITES.length; i++) {
            const siteName = this.SITES[i].siteName.trim().toLowerCase();
            if (site === siteName) {
                const isAdd = cmd === "add" || cmd === "addtemp";
                this.SITES[i].updateList(nm, isAdd, isTemp);
            }
        }
    }

    mkdir(dir) {
        const fulldir = path.resolve(dir);
        mkdirp(fulldir, (err) => {
            if (err) {
                this.log(err.toString());
                process.exit(1);
            }
        });
        return fulldir;
    }

    loadConfig() {
        this.config = yaml.safeLoad(fs.readFileSync("config.yml", "utf8"));

        colors.setTheme({
            name:    this.config.namecolor,
            state:   this.config.statecolor,
            offline: this.config.offlinecolor,
            file:    this.config.filecolor,
            time:    this.config.timecolor,
            site:    this.config.sitecolor,
            debug:   this.config.debugcolor,
            error:   this.config.errorcolor
        });

        this.config.captureDirectory  = this.mkdir(this.config.captureDirectory);
        this.config.completeDirectory = this.mkdir(this.config.completeDirectory);

        this.display(this.config.listshown ? "show" : "hide", "list");
        this.display(this.config.logshown  ? "show" : "hide", "log");
        this.render();
    }

    busy() {
        let capsInProgress = 0;

        for (let i = 0; i < this.SITES.length; i++) {
            capsInProgress += this.SITES[i].getNumCapsInProgress();
        }
        return capsInProgress > 0;
    }

    tryExit() {
        // delay exiting until all capture and postprocess
        // ffmpeg jobs have completed.
        if (!this.busy()) {
            for (let i = 0; i < this.SITES.length; i++) {
                this.SITES[i].disconnect();
            }
            process.exit(0);
        } else {
            sleep(1000).then(() => {
                this.tryExit(); // recursion!
            });
        }
    }

    exit() {
        // Prevent bad things from happening if user holds down ctrl+c
        if (!this.tryingToExit) {
            this.tryingToExit = 1;
            if (this.busy()) {
                this.log("Waiting for ffmpeg captures to terminate.");
            }
            this.tryExit();
        }

        // Allow this to execute multiple times so that SIGINT
        // can get passed again to ffmpeg in case some get hung.
        if (this.busy()) {
            for (let i = 0; i < this.SITES.length; i++) {
                this.SITES[i].haltAllCaptures();
            }
        }
    }
}

exports.Tui = Tui;

