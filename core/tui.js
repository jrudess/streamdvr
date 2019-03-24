"use strict";

const blessed = require("neo-blessed");

class Tui {
    constructor(config, dvr) {

        this.config = config;
        this.dvr = dvr;
        this.SITES = [];
        this.logHidden = false;
        this.listHidden = true;
        this.longestName = 7;

        this.createTui();
    }

    createTui() {
        this.screen = blessed.screen({smartCSR: true, autoPadding: true, dockBorders: true});
        this.screen.title = "streamdvr";
        this.listSelect = null;
        this.sitelistSelect = null;

        this.list = blessed.listtable({
            top: 0,
            left: 0,
            // TODO: Listtable behaves screwy when shrink is set, and also need
            // to align log to right side of list as well, but list.width is
            // some very large value.
            // shrink: "true",
            width: this.calcLogLeft(),
            height: "100%-11",
            align: "left",
            interactive: false,
            keys: true,
            mouse: false,
            noCellBorders: true,
            tags: true,
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

        this.sitelist = blessed.listtable({
            top: "100%-11",
            left: 0,
            // TODO: Listtable behaves screwy when shrink is set, and also need
            // to align log to right side of list as well, but list.width is
            // some very large value.
            // shrink: "true",
            width: this.calcLogLeft(),
            height: 10,
            align: "left",
            interactive: false,
            keys: true,
            mouse: false,
            noCellBorders: true,
            tags: true,
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
            this.prompt.content = "❯ ".prompt;
        } else {
            this.prompt.content = "> ".prompt;
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
        this.inputBar.hide();

        this.listmenu = blessed.list({
            top: 8,
            left: 18,
            width: 16,
            height: 6,
            padding: {
                left: 3,
                right: 3,
                top: 1,
                bottom: 1
            },
            interactive: true,
            keys: true,
            mouse: false,
            tags: true,
            border: {
                type: "bg",
                ch: "░"
            },
            style: {
                border: {
                    bg: "blue",
                    fg: "blue"
                },
                bg: "black",
                fg: "white"
            }
        });
        this.listmenu.hide();

        this.sitemenu = blessed.list({
            top: "100%-9",
            left: 18,
            width: 16,
            height: 6,
            padding: {
                left: 3,
                right: 3,
                top: 1,
                bottom: 1
            },
            interactive: true,
            keys: true,
            mouse: false,
            tags: true,
            border: {
                type: "bg",
                ch: "░"
            },
            style: {
                border: {
                    bg: "blue",
                    fg: "blue"
                },
                bg: "black",
                fg: "white"
            }
        });
        this.sitemenu.hide();

        this.screen.key("1", () => {
            this.sitemenu.hide();
            this.sitelist.interactive = false;
            this.list.interactive = true;
            this.list.focus();
            this.render();
        });

        this.screen.key("2", () => {
            this.listmenu.hide();
            this.list.interactive = false;
            this.sitelist.interactive = true;
            this.sitelist.focus();
            this.render();
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
            if (this.screen.focused === this.logbody) {
                this.list.interactive = false;
                this.prompt.show();
                this.inputBar.show();
                this.render();
                this.inputBar.focus();
            }
        });

        // Close on q, or ctrl+c
        // Note: tui.screen intercepts ctrl+c and it does not pass down to ffmpeg
        this.screen.key(["q", "C-c"], () => (
            this.dvr.exit()
        ));

        this.list.on("selectrow", (item, index) => {
            if (index < this.list.rows.length) {
                this.listSelect = this.list.rows[index];
            } else {
                this.listSelect = null;
            }
        });

        this.list.on("select", () => {
            this.listmenu.show();
            this.listmenu.focus();
            this.render();
        });

        this.list.on("cancel", () => {
            this.list.interactive = false;
            this.logbody.focus();
            this.render();
        });

        this.list.key("r", () => {
            for (let i = 0; i < this.SITES.length; i++) {
                this.SITES[i].getStreamers();
            }
        });

        this.sitelist.on("selectrow", (item, index) => {
            if (index < this.sitelist.rows.length) {
                this.sitelistSelect = this.sitelist.rows[index];
            } else {
                this.sitelistSelect = null;
            }
        });

        this.sitelist.on("select", () => {
            this.sitemenu.show();
            this.sitemenu.focus();
            this.render();
        });

        this.sitelist.on("cancel", () => {
            this.sitelist.interactive = false;
            this.logbody.focus();
            this.render();
        });

        this.listmenu.on("select", (item, index) => {
            if (this.listSelect && this.listSelect.length >= 2) {
                const site = blessed.helpers.stripTags(this.listSelect[2]).toLowerCase();
                const name = blessed.helpers.stripTags(this.listSelect[0]);
                switch (index) {
                case 0: // pause
                    this.updateList(site, name, {add: 0, pause: 1, isTemp: false, init: false});
                    break;
                case 1: // remove
                    this.updateList(site, name, {add: 0, pause: 0, isTemp: false, init: false});
                    break;
                }
            }
            this.listmenu.hide();
            this.list.interactive = true;
            this.list.focus();
            this.render();
        });

        this.listmenu.on("cancel", () => {
            this.listmenu.hide();
            this.list.interactive = true;
            this.list.focus();
            this.render();
        });

        this.sitemenu.on("select", (item, index) => {
            if (this.sitelistSelect && this.sitelistSelect.length >= 1) {
                const site = blessed.helpers.stripTags(this.sitelistSelect[0]).toLowerCase();
                switch (index) {
                case 0: // pause
                    this.updateList(site, "", {add: 0, pause: 1, isTemp: false, init: false});
                    this.sitelist.focus();
                    this.sitemenu.hide();
                    this.render();
                    break;
                case 1: // add
                    this.prompt.show();
                    this.inputBar.show();
                    this.render();
                    this.inputBar.focus();
                    break;
                }
            }
        });

        this.sitemenu.on("cancel", () => {
            this.sitemenu.hide();
            this.sitelist.interactive = true;
            this.sitelist.focus();
            this.render();
        });

        this.inputBar.on("cancel", () => {
            this.prompt.hide();
            this.inputBar.clearValue();
            this.inputBar.hide();
            this.render();
        });

        this.inputBar.key(["C-c"], () => (
            this.dvr.exit()
        ));

        this.screen.append(this.list);
        this.screen.append(this.sitelist);
        this.screen.append(this.logbody);
        this.screen.append(this.prompt);
        this.screen.append(this.inputBar);
        this.screen.append(this.listmenu);
        this.screen.append(this.sitemenu);
        this.logbody.focus();

        this.listmenu.pushItem("pause");
        this.listmenu.pushItem("remove");
        this.listmenu.setScrollPerc(100);

        this.sitemenu.pushItem("pause");
        this.sitemenu.pushItem("add");
        this.sitemenu.setScrollPerc(100);

        this.list.selected = 1;
        this.sitelist.selected = 1;

        // CLI
        this.inputBar.on("submit", (text) => {
            this.prompt.hide();
            this.inputBar.clearValue();
            this.inputBar.hide();

            if (this.sitelist.interactive) {
                if (this.sitelistSelect) {
                    this.updateList(blessed.helpers.stripTags(this.sitelistSelect[0]).toLowerCase(), text, {add: 1, pause: 0, isTemp: 0, init: false});
                }
                this.sitemenu.focus();
                this.render();
                return;
            }

            const tokens = text.split(" ");
            if (tokens.length === 0) {
                this.render();
                return;
            }

            const temp  = tokens[0] === "addtemp";
            const pause = tokens[0] === "pause" || tokens[0] === "unpause";
            const add   = tokens[0] === "add" || tokens[0] === "addtemp";

            switch (tokens[0]) {
            case "add":
            case "addtemp":
            case "remove":
            case "pause":
            case "unpause":
                if (tokens.length >= 3) {
                    this.updateList(tokens[1], tokens[2], {add: add, pause: pause, isTemp: temp, init: false});
                } else if (tokens.length === 2) {
                    this.updateList(tokens[1], "", {add: add, pause: pause, isTemp: temp, init: false});
                }
                break;

            case "reload":
                this.dvr.loadConfig();
                this.config = this.dvr.config;
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
                this.logbody.pushLine("pause   [site] <streamer>");
                this.logbody.pushLine("unpause [site] <streamer>");
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

    addSite(site) {
        this.SITES.push(site);

        const sitetable = [];
        sitetable.push(["", ""]);
        for (let i = 0; i < this.SITES.length; i++) {
            sitetable.push(["{" + this.config.colors.state + "-fg}" + this.SITES[i].siteName + "{/}", ""]);
        }
        this.sitelist.setData(sitetable);
    }

    start() {
        this.display(this.config.tui.listshown ? "show" : "hide", "list");
        this.display(this.config.tui.logshown  ? "show" : "hide", "log");
    }

    log(text) {
        this.logbody.pushLine(text);
        if (!this.logHidden) {
            this.logbody.setScrollPerc(100);
            this.render();
        }
    }

    rebuildList() {
        const table = [];
        this.longestName = 7; // Sets a minimum size
        table.push(["", "", "", ""]);
        for (const site of this.SITES.values()) {
            let sortedKeys = [];
            const streamerList = site.streamerList;
            if (streamerList.size > 0) {
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
                const name  = "{" + this.config.colors.name + "-fg}" + value.nm + "{/}";
                let state;
                if (value.filename === "") {
                    if (value.state === "Offline") {
                        state = "{" + this.config.colors.offline + "-fg}";
                    } else {
                        state = "{" + this.config.colors.state + "-fg}";
                    }
                    state += value.state + (value.paused ? " [paused]" : "");
                } else {
                    state = "{" + this.config.colors.file + "-fg}" + value.filename;
                }
                state += "{/}";
                const temp = value.isTemp ? ("{" + this.config.colors.state + "-fg}[temp]{/}") : "";
                table.push([name, temp, site.siteName, state]);
                if (value.nm.length > this.longestName) {
                    this.longestName = value.nm.length;
                }
            }
        }
        this.list.setData(table);
        this.logbody.left = this.calcLogLeft();
    }

    render(redrawList, site) {
        if (!this.config.tui.enable || typeof this.screen === "undefined") {
            return;
        }

        if (!this.listHidden && redrawList) {
            this.rebuildList();
            if (site) {
                site.redrawList = false;
            }
        }

        this.screen.render();
    }

    calcLogLeft() {
        return 62;
    }

    // Runtime UI adjustments
    display(cmd, window) {
        switch (window) {
        case "list":
            switch (cmd) {
            case "show":
                this.logbody.left = this.calcLogLeft();
                this.listHidden   = false;
                this.rebuildList();
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
    async updateList(siteName, nm, options) {
        for (const site of this.SITES.values()) {
            if (siteName === site.listName) {
                if (nm === "") {
                    if (options.pause) {
                        site.pause();
                    }
                } else {
                    const dirty = await site.updateList(nm, options) && !options.isTemp;
                    if (dirty) {
                        await site.writeConfig();
                    }
                }
                return;
            }
        }
    }
}

exports.Tui = Tui;

