const blessed = require("neo-blessed");
const colors  = require("colors/safe");
const fs      = require("fs");
const path    = require("path");
const yaml    = require("js-yaml");

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

class Tui {
    constructor() {
        let checkHome = 1;

        if (process.env.XDG_CONFIG_HOME) {
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
        if (this.config.log.enable) {
            const {Console} = require("console");
            const attr = (this.config.log.append) ? "a" : "w";
            const logFile = fs.createWriteStream("./streamdvr.log", {flags: attr});
            this.logger = new Console({stdout: logFile, stderr: logFile});
        }

        this.SITES = [];
        this.tryingToExit = false;

        this.logHidden = false;
        this.listHidden = true;
        this.longestName = 13;

        process.on("SIGINT", () => {
            this.exit();
        });

        if (this.config.tui.enable) {
            this.screen = blessed.screen({smartCSR: true, autoPadding: true, dockBorders: true});
            this.screen.title = "streamdvr";

            this.list = blessed.listtable({
                top: 0,
                left: 0,
                height: "100%-1",
                shrink: "true",
                align: "left",
                interactive: false,
                keys: true,
                mouse: false,
                noCellBorders: true,
                alwaysScroll: true,
                scrollable: true,
                scrollbar: {
                    ch: " ",
                    bg: "blue"
                },
                border: {
                    type: "line"
                },
                style: {
                    border: {
                        fg: "blue"
                    }
                }
            });

            this.logbody = blessed.box({
                top: 0,
                height: "100%-1",
                grow: true,
                keys: true,
                mouse: false,
                alwaysScroll: true,
                scrollable: true,
                scrollbar: {
                    ch: " ",
                    bg: "blue"
                },
                border: {
                    type: "line"
                },
                style: {
                    border: {
                        fg: "blue"
                    }
                }
            });

            this.prompt = blessed.text({
                bottom: 0,
                left: 0,
                width: 2,
                height: 1,
                mouse: false,
                style: {
                    fg: "white",
                    bg: "none"
                }
            });
            if (this.config.tui.allowUnicode) {
                this.prompt.content = colors.prompt("❯ ");
            } else {
                this.prompt.content = colors.prompt("> ");
            }
            this.prompt.hide();

            this.inputBar = blessed.textbox({
                bottom: 0,
                left: 2,
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

            this.screen.key("1", () => {
                this.list.interactive = true;
                this.render();
                this.list.focus();
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
                this.list.interactive = false;
                this.prompt.show();
                this.render();
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
            this.screen.append(this.prompt);
            this.screen.append(this.inputBar);
            this.logbody.focus();

            // CLI
            this.inputBar.on("submit", (text) => {
                this.prompt.hide();
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
                case "pause":
                case "unpause":
                    if (tokens.length >= 3) {
                        const temp  = tokens[0] === "temp";
                        const pause = tokens[0] === "pause" ? 1 : tokens[0] === "unpause" ? 2 : 0;
                        this.updateList(tokens[0], tokens[1], tokens[2], temp, pause);
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
                    this.logbody.pushLine("pause   [site] [streamer]");
                    this.logbody.pushLine("unpause [site] [streamer]");
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
        if (this.config.tui.enable) {
            this.display(this.config.tui.listshown ? "show" : "hide", "list");
            this.display(this.config.tui.logshown  ? "show" : "hide", "log");
        }
    }

    log(text, options) {
        if (this.config.tui.enable) {
            this.logbody.pushLine(text);
            if (!this.logHidden) {
                this.logbody.setScrollPerc(100);
                this.render();
            }
        } else if (options && options.trace && this.config.debug.errortrace) {
            console.trace(text);
        } else {
            console.log(text);
        }
        if (this.logger) {
            this.logger.log(text);
        }
    }

    render() {
        if (!this.config.tui.enable || typeof this.screen === "undefined") {
            return;
        }

        let listDamaged = false;
        if (!this.listHidden) {
            for (let i = 0; i < this.SITES.length; i++) {
                const streamerList = this.SITES[i].streamerList;
                if (streamerList.size > 0) {
                    listDamaged |= this.SITES[i].streamerListDamaged;
                    this.SITES[i].streamerListDamaged = false;
                }
            }
        }

        if (listDamaged) {
            const table = [];
            let first = true;
            this.longestName = 7;
            for (let i = 0; i < this.SITES.length; i++) {
                let sortedKeys = [];
                const streamerList = this.SITES[i].streamerList;
                if (streamerList.size > 0) {
                    if (!first) {
                        table.push(["", ""]);
                    } else {
                        first = false;
                    }
                    table.push([this.SITES[i].siteName, "", ""]);

                    // Map keys are UID, but want to sort list by name.
                    sortedKeys = Array.from(streamerList.keys()).sort((a, b) => {
                        if (streamerList.get(a).nm < streamerList.get(b).nm) {
                            return -1;
                        }
                        if (streamerList.get(a).nm > streamerList.get(b).nm) {
                            return 1;
                        }
                        return 0;
                    });
                }
                for (let j = 0; j < sortedKeys.length; j++) {
                    const value = streamerList.get(sortedKeys[j]);
                    const name  = colors.name(value.nm);
                    let state;
                    if (value.filename === "") {
                        state = value.state + (value.paused ? " [paused]" : "");
                        state = (value.state === "Offline") ? colors.offline(state) : colors.state(state);
                    } else {
                        state = colors.file(value.filename);
                    }
                    const temp = colors.state(value.isTemp ? "[temp]" : " ");
                    table.push([name, temp, state]);
                    if (value.nm.length > this.longestName) {
                        this.longestName = value.nm.length;
                    }
                }
            }
            this.list.setData(table);
            this.list.width   = this.calcListWidth();
            this.logbody.left = this.list.width;
        }
        this.screen.render();
    }

    calcListWidth() {
        return (this.longestName * 2) + 32;
    }

    // Runtime UI adjustments
    display(cmd, window) {
        switch (window) {
        case "list":
            switch (cmd) {
            case "show":
                this.list.width   = this.calcListWidth();
                this.logbody.left = this.list.width;
                this.listHidden   = false;
                this.list.show();
                break;
            case "hide":
                this.logbody.left = 0;
                this.listHidden   = true;
                this.list.hide();
                break;
            }
            break;
        case "log":
            switch (cmd) {
            case "show":
                this.logbody.setScrollPerc(100);
                this.logHidden = false;
                this.logbody.show();
                break;
            case "hide":
                this.logHidden = true;
                this.logbody.hide();
                break;
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
    async updateList(cmd, site, nm, isTemp, pause) {
        for (let i = 0; i < this.SITES.length; i++) {
            if (site === this.SITES[i].listName) {
                const isAdd = cmd === "add" || cmd === "addtemp";
                const dirty = await this.SITES[i].updateList(nm, isAdd, isTemp, pause) && !isTemp;
                if (dirty) {
                    await this.SITES[i].writeConfig();
                }
                return;
            }
        }
    }

    mkdir(dir) {
        const fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, {recursive: true}, (err) => {
            if (err) {
                this.log(err.toString());
                process.exit(1);
            }
        });
        return fulldir;
    }

    loadConfig() {
        try {
            this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));
        } catch (err) {
            console.log("ERROR: Failed to load config.yml:" + err.toString());
            process.exit(1);
        }

        colors.setTheme({
            name:    this.config.colors.name,
            state:   this.config.colors.state,
            offline: this.config.colors.offline,
            prompt:  this.config.colors.prompt,
            file:    this.config.colors.file,
            time:    this.config.colors.time,
            site:    this.config.colors.site,
            cmd:     this.config.colors.cmd,
            debug:   this.config.colors.debug,
            error:   this.config.colors.error
        });

        this.config.recording.captureDirectory  = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);

        if (this.config.tui.enable && this.list) {
            this.display(this.config.tui.listshown ? "show" : "hide", "list");
            this.display(this.config.tui.logshown  ? "show" : "hide", "log");
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

    async tryExit() {
        while (true) {
            // delay exiting until all capture and postprocess
            // ffmpeg jobs have completed.
            if (!this.busy()) {
                for (let i = 0; i < this.SITES.length; i++) {
                    await this.SITES[i].disconnect();
                }
                process.exit(0);
            } else {
                await sleep(1000);
            }
        }
    }

    exit() {
        // Prevent bad things from happening if user holds down ctrl+c
        if (!this.tryingToExit) {
            this.tryingToExit = true;
            if (this.busy()) {
                this.log("Stopping all recordings...");
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

