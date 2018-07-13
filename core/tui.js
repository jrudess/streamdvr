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
    constructor() {
        // For sizing columns
        this.listpad = "                           ";

        let checkHome = 1;

        if (typeof process.env.XDG_CONFIG_HOME !== "undefined") {
            this.configdir = process.env.XDG_CONFIG_HOME + "/streamdvr/";
            if (fs.existsSync(this.configdir + "config.yml")) {
                checkHome = 0;
            }
        }

        if (checkHome) {
            this.configdir = process.platform === "win32" ? process.env.APPDATA + "/streamdvr/" : process.env.HOME + "/.config/streamdvr/";
        }

        if (!fs.existsSync(this.configdir + "config.yml")) {
            this.configdir = "./config/";
        }

        this.configfile = this.configdir + "config.yml";

        if (!fs.existsSync(this.configfile)) {
            console.log("ERROR: Could not find config.yml");
            process.exit(1);
        }

        this.config = null;
        this.loadConfig();

        this.logger = null;
        if (typeof this.config.logenable !== "undefined" && this.config.logenable) {
            const {Console} = require("console");
            const attr = (typeof this.config.logappend !== "undefined" && this.config.logappend) ? "a" : "w";
            const logFile = fs.createWriteStream("./streamdvr.log", {flags: attr});
            this.logger = new Console({stdout: logFile, stderr: logFile});
        }

        this.SITES = [];
        this.tryingToExit = false;

        this.logHidden = false;
        this.listHidden = true;

        process.on("SIGINT", () => {
            this.exit();
        });

        if (this.config.tui) {
            this.screen = blessed.screen({smartCSR: true, autoPadding: true, dockBorders: true});
            this.screen.title = "streamdvr";

            this.list = blessed.box({
                top: 0,
                left: 0,
                height: "100%-1",
                width: 60,
                keys: true,
                mouse: false,
                alwaysScroll: true,
                scrollable: true,
                draggable: false,
                shadow: false,
                scrollbar: {
                    ch: " ",
                    bg: "blue"
                },
                border: {
                    type: "line",
                    fg: "blue"
                }
            });

            this.logbody = blessed.box({
                top: 0,
                left: 59,
                height: "100%-1",
                width: "100%-70",
                keys: true,
                mouse: false,
                alwaysScroll: true,
                scrollable: true,
                scrollbar: {
                    ch: " ",
                    bg: "blue"
                },
                border: {
                    type: "line",
                    fg: "blue"
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
                this.exit()
            ));

            this.screen.append(this.list);
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
                this.render();
            });
        }
    }

    addSite(site) {
        this.SITES.push(site);
    }

    // Called after SITES is populated
    init() {
        // Initial loadConfig is called before sites are created
        // so correct the shown status for the new lists.
        if (this.config.tui) {
            this.display(this.config.listshown ? "show" : "hide", "list");


            const hotkeys = ["1"];
            for (let i = 0; i < hotkeys.length; i++) {
                this.screen.key(hotkeys[i], () => {
                    this.list.focus();
                });
            }
        }
    }

    log(text) {
        if (this.config.tui) {
            this.logbody.pushLine(text);
            this.logbody.setScrollPerc(100);
            if (!this.logHidden) {
                this.render();
            }
        } else {
            console.log(text);
        }
        if (this.logger !== null) {
            this.logger.log(text);
        }
    }

    render() {
        if (!this.config.tui || typeof this.screen === "undefined") {
            return;
        }

        if (!this.listHidden) {
            // TODO: Hack
            for (let i = 0; i < 300; i++) {
                this.list.deleteLine(0);
            }

            let first = true;
            for (let i = 0; i < this.SITES.length; i++) {
                const streamerList = this.SITES[i].getStreamerList();
                if (streamerList.length > 0) {
                    if (!first) {
                        this.list.pushLine("");
                    } else {
                        first = false;
                    }
                    this.list.pushLine(this.SITES[i].siteName);
                }
                for (let j = 0; j < streamerList.length; j++) {
                    const value = streamerList[j];
                    const name  = (colors.name(value.nm) + this.listpad).substring(0, this.listpad.length);
                    let state;
                    if (value.filename === "") {
                        state = value.state === "Offline" ? colors.offline(value.state) : colors.state(value.state);
                    } else {
                        state = colors.file(value.filename);
                    }
                    this.list.pushLine(name + state);
                }
            }
        }
        this.screen.render();
    }

    // Runtime UI adjustments
    display(cmd, window) {
        switch (window) {
        case "list":
            switch (cmd) {
            case "show": this.list.show(); this.logbody.left = 59; this.logbody.width = "100%-60"; this.listHidden = false; break;
            case "hide": this.list.hide(); this.logbody.left = 0;  this.logbody.width = "100%";    this.listHidden = true;  break;
            }
            break;
        case "log":
            switch (cmd) {
            case "show": this.logbody.show(); this.list.width = 60;     this.logHidden = false; break;
            case "hide": this.logbody.hide(); this.list.width = "100%"; this.logHidden = true;  break;
            }
            break;
        }

        if (this.listHidden || this.logHidden) {
            this.list.border.type = "bg";
            this.logbody.border.type = "bg";
        } else {
            this.list.border.type = "line";
            this.logbody.border.type = "line";
        }

        this.render();
    }

    // Add and remove streamers
    updateList(cmd, site, nm, isTemp) {
        for (let i = 0; i < this.SITES.length; i++) {
            if (site === this.SITES[i].listName) {
                const isAdd = cmd === "add" || cmd === "addtemp";
                if (this.SITES[i].updateList(nm, isAdd, isTemp) && !isTemp) {
                    this.SITES[i].writeConfig();
                }
                return;
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
        this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));

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

        if (this.config.tui && typeof this.list !== "undefined") {
            this.display(this.config.listshown ? "show" : "hide", "list");
            this.display(this.config.logshown  ? "show" : "hide", "log");
            this.render();
        }
    }

    busy() {
        for (let i = 0; i < this.SITES.length; i++) {
            if (this.SITES[i].getNumCapsInProgress() > 0) {
                return true;
            }
        }
        return false;
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
            this.tryingToExit = true;
            if (this.busy()) {
                this.log("Waiting for all captures to terminate...");
            }
            this.tryExit();
        }

        // Allow this to execute multiple times so that SIGINT
        // can get passed again to ffmpeg/streamdvr in case some get hung.
        for (let i = 0; i < this.SITES.length; i++) {
            this.SITES[i].haltAllCaptures();
        }
    }
}

exports.Tui = Tui;

