"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const site_1 = require("./site");
const blessed = require("neo-blessed");
const colors = require("colors");
class Tui {
    constructor(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.SITES = [];
        this.hideOffline = false;
        this.createTui();
    }
    createTui() {
        this.screen = blessed.screen({ smartCSR: true, autoPadding: true, dockBorders: true });
        this.screen.title = "streamdvr";
        this.listSelect = null;
        this.sitelistSelect = null;
        this.list = blessed.listtable({
            top: 0,
            left: 0,
            width: 67,
            height: "100%-11",
            align: "left",
            interactive: false,
            keys: true,
            mouse: false,
            noCellBorders: true,
            tags: true,
            padding: {
                left: 1,
            },
            alwaysScroll: true,
            scrollable: true,
            scrollbar: {
                ch: " ",
                bg: "blue",
            },
            border: {
                type: "line",
            },
            style: {
                border: {
                    fg: "blue",
                },
            },
        });
        this.sitelist = blessed.listtable({
            top: "100%-11",
            left: 0,
            width: 67,
            height: 10,
            align: "left",
            interactive: false,
            keys: true,
            mouse: false,
            noCellBorders: true,
            tags: true,
            padding: {
                left: 1,
            },
            alwaysScroll: true,
            scrollable: true,
            scrollbar: {
                ch: " ",
                bg: "blue",
            },
            border: {
                type: "line",
            },
            style: {
                border: {
                    fg: "blue",
                },
            },
        });
        this.logbody = blessed.box({
            top: 0,
            left: 67,
            height: "100%-1",
            grow: true,
            keys: true,
            mouse: false,
            alwaysScroll: true,
            scrollable: true,
            scrollbar: {
                ch: " ",
                bg: "blue",
            },
            border: {
                type: "line",
            },
            style: {
                border: {
                    fg: "blue",
                },
            },
        });
        this.prompt = blessed.text({
            bottom: 0,
            left: 0,
            width: 2,
            height: 1,
            mouse: false,
            style: {
                fg: "white",
                bg: "none",
            },
        });
        this.prompt.content = this.config.tui.allowUnicode ?
            colors.prompt("❯ ") :
            colors.prompt("> ");
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
                bg: "none",
            },
        });
        this.inputBar.hide();
        this.listmenu = blessed.list({
            top: 8,
            left: 18,
            width: 23,
            height: 8,
            padding: {
                left: 3,
                right: 3,
                top: 1,
                bottom: 1,
            },
            interactive: true,
            keys: true,
            mouse: false,
            tags: true,
            border: {
                type: "bg",
                ch: "░",
            },
            style: {
                border: {
                    bg: "blue",
                    fg: "blue",
                },
                bg: "black",
                fg: "white",
            },
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
                bottom: 1,
            },
            interactive: true,
            keys: true,
            mouse: false,
            tags: true,
            border: {
                type: "bg",
                ch: "░",
            },
            style: {
                border: {
                    bg: "blue",
                    fg: "blue",
                },
                bg: "black",
                fg: "white",
            },
        });
        this.sitemenu.hide();
        this.screen.key("1", () => {
            this.listmenu.hide();
            this.sitemenu.hide();
            this.sitelist.interactive = false;
            this.list.interactive = true;
            this.list.focus();
            this.render(false);
        });
        this.screen.key("2", () => {
            this.sitemenu.hide();
            this.listmenu.hide();
            this.list.interactive = false;
            this.sitelist.interactive = true;
            this.sitelist.focus();
            this.render(false);
        });
        this.screen.key("pageup", () => {
            this.screen.focused.scroll(-this.screen.focused.height || -1);
            this.render(false);
        });
        this.screen.key("pagedown", () => {
            this.screen.focused.scroll(this.screen.focused.height || 1);
            this.render(false);
        });
        // Close on q, or ctrl+c
        // Note: tui.screen intercepts ctrl+c and it does not pass down to ffmpeg
        this.screen.key(["q", "C-c"], () => (this.dvr.exit()));
        this.logbody.key(["i", "enter"], () => {
            if (this.screen.focused === this.logbody) {
                this.prompt.show();
                this.inputBar.show();
                this.inputBar.focus();
                this.render(false);
            }
        });
        this.logbody.key(["j"], () => {
            this.logbody.scroll(1);
            this.render(false);
        });
        this.logbody.key(["k"], () => {
            this.logbody.scroll(-1);
            this.render(false);
        });
        this.list.on("selectrow", (item, index) => {
            this.listSelect = index < this.list.rows.length ?
                this.list.rows[index] :
                null;
        });
        this.list.key(["j"], () => {
            this.list.down(1);
            this.render(false);
        });
        this.list.key(["k"], () => {
            this.list.up(1);
            this.render(false);
        });
        this.list.on("select", () => {
            this.listmenu.show();
            this.listmenu.focus();
            this.render(false);
        });
        this.list.on("cancel", () => {
            this.list.interactive = false;
            this.logbody.focus();
            this.render(false);
        });
        this.list.key("r", () => {
            for (const site of this.SITES) {
                site.getStreamers();
            }
        });
        this.sitelist.on("selectrow", (item, index) => {
            this.sitelistSelect = index < this.sitelist.rows.length ?
                this.sitelist.rows[index] :
                null;
        });
        this.sitelist.key(["j"], () => {
            this.sitelist.down(1);
            this.render(false);
        });
        this.sitelist.key(["k"], () => {
            this.sitelist.up(1);
            this.render(false);
        });
        this.sitelist.on("select", () => {
            this.sitemenu.show();
            this.sitemenu.focus();
            this.render(false);
        });
        this.sitelist.on("cancel", () => {
            this.sitelist.interactive = false;
            this.logbody.focus();
            this.render(false);
        });
        this.listmenu.key(["j"], () => {
            this.listmenu.down(1);
            this.render(false);
        });
        this.listmenu.key(["k"], () => {
            this.listmenu.up(1);
            this.render(false);
        });
        this.listmenu.on("select", (item, index) => {
            switch (index) {
                case 0: // pause
                    if (this.listSelect && this.listSelect.length >= 2) {
                        const site = blessed.helpers.stripTags(this.listSelect[2]).toLowerCase();
                        const name = blessed.helpers.stripTags(this.listSelect[0]);
                        this.updateList(site, name, site_1.UpdateCmd.PAUSE);
                        this.listmenu.hide();
                        this.list.focus();
                        this.render(false);
                    }
                    break;
                case 1: // pause timer
                    this.prompt.show();
                    this.inputBar.show();
                    this.inputBar.focus();
                    this.render(false);
                    break;
                case 2: // remove
                    if (this.listSelect && this.listSelect.length >= 2) {
                        const site = blessed.helpers.stripTags(this.listSelect[2]).toLowerCase();
                        const name = blessed.helpers.stripTags(this.listSelect[0]);
                        this.updateList(site, name, site_1.UpdateCmd.REMOVE);
                        this.listmenu.hide();
                        this.list.focus();
                        this.render(false);
                    }
                    break;
                case 3: // toggle offline
                    this.hideOffline = !this.hideOffline;
                    this.listmenu.hide();
                    this.list.interactive = true;
                    this.list.focus();
                    this.render(true);
                    this.listSelect = this.list.rows.length <= 1 ?
                        null :
                        this.list.rows[1];
                    break;
            }
        });
        this.listmenu.on("cancel", () => {
            this.listmenu.hide();
            this.list.interactive = true;
            this.list.focus();
            this.render(false);
        });
        this.sitemenu.on("select", (item, index) => {
            if (this.sitelistSelect && this.sitelistSelect.length >= 1) {
                const site = blessed.helpers.stripTags(this.sitelistSelect[0]).toLowerCase();
                switch (index) {
                    case 0: // pause
                        this.updateList(site, "", site_1.UpdateCmd.PAUSE);
                        this.sitelist.focus();
                        this.sitelist.interactive = true;
                        this.sitemenu.hide();
                        this.render(false);
                        break;
                    case 1: // add
                        this.prompt.show();
                        this.inputBar.show();
                        this.render(false);
                        this.inputBar.focus();
                        break;
                }
            }
        });
        this.sitemenu.key(["j"], () => {
            this.sitemenu.down(1);
            this.render(false);
        });
        this.sitemenu.key(["k"], () => {
            this.sitemenu.up(1);
            this.render(false);
        });
        this.sitemenu.on("cancel", () => {
            this.sitemenu.hide();
            this.sitelist.interactive = true;
            this.sitelist.focus();
            this.render(false);
        });
        this.inputBar.on("cancel", () => {
            this.prompt.hide();
            this.inputBar.clearValue();
            this.inputBar.hide();
            this.render(false);
        });
        this.inputBar.key(["C-c"], () => (this.dvr.exit()));
        this.screen.append(this.list);
        this.screen.append(this.sitelist);
        this.screen.append(this.logbody);
        this.screen.append(this.prompt);
        this.screen.append(this.inputBar);
        this.screen.append(this.listmenu);
        this.screen.append(this.sitemenu);
        this.logbody.focus();
        this.listmenu.pushItem("pause");
        this.listmenu.pushItem("pause timer");
        this.listmenu.pushItem("remove");
        this.listmenu.pushItem("toggle offline");
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
            if (this.list.interactive) {
                if (this.listSelect && this.listSelect.length >= 2) {
                    const site = blessed.helpers.stripTags(this.listSelect[2]).toLowerCase();
                    const name = blessed.helpers.stripTags(this.listSelect[0]);
                    new Promise(async () => {
                        await this.updateList(site, name, site_1.UpdateCmd.PAUSE);
                        const pauseTimer = Number(text);
                        await this.updateList(site, name, site_1.UpdateCmd.PAUSE, false, pauseTimer);
                    });
                }
                this.listmenu.hide();
                this.list.focus();
                this.render(false);
                return;
            }
            else if (this.sitelist.interactive) {
                if (this.sitelistSelect) {
                    const site = blessed.helpers.stripTags(this.sitelistSelect[0]).toLowerCase();
                    this.updateList(site, text, site_1.UpdateCmd.ADD);
                }
                this.sitemenu.focus();
                this.render(false);
                return;
            }
            const tokens = text.split(" ");
            if (tokens.length !== 0) {
                this.parseCli(tokens);
            }
            this.logbody.focus();
            this.render(false);
        });
    }
    parseCli(tokens) {
        const temp = tokens[0] === "addtemp";
        const pause = tokens[0] === "pause" || tokens[0] === "unpause";
        const add = tokens[0] === "add" || tokens[0] === "addtemp";
        switch (tokens[0]) {
            case "add":
            case "addtemp":
            case "remove":
            case "pause":
            case "unpause":
                const cmd = add ? site_1.UpdateCmd.ADD :
                    pause ? site_1.UpdateCmd.PAUSE :
                        site_1.UpdateCmd.REMOVE;
                if (tokens.length >= 3) {
                    this.updateList(tokens[1], tokens[2], cmd, temp);
                    if (pause && tokens.length >= 4) {
                        this.updateList(tokens[1], tokens[2], cmd, temp, tokens[3]);
                    }
                }
                else if (tokens.length === 2) {
                    this.updateList(tokens[1], "", cmd, temp);
                }
                break;
            case "reload":
                this.dvr.loadConfig();
                this.config = this.dvr.config;
                break;
            case "help":
                this.logbody.pushLine("Commands:");
                this.logbody.pushLine("add     [site] [streamer]");
                this.logbody.pushLine("addtemp [site] [streamer]");
                this.logbody.pushLine("pause   [site] <streamer>");
                this.logbody.pushLine("unpause [site] <streamer>");
                this.logbody.pushLine("remove  [site] [streamer]");
                this.logbody.pushLine("reload");
                this.logbody.setScrollPerc(100);
                break;
        }
    }
    addSite(site) {
        this.SITES.push(site);
        const sitetable = [];
        sitetable.push(["", ""]);
        for (const site of this.SITES) {
            sitetable.push(["{" + this.config.colors.state + "-fg}" + site.siteName + "{/}", ""]);
        }
        this.sitelist.setData(sitetable);
    }
    log(text) {
        this.logbody.pushLine(text);
        this.logbody.setScrollPerc(100);
        this.render(false);
    }
    buildListEntry(site, streamer) {
        const name = "{" + this.config.colors.name + "-fg}" + streamer.nm + "{/}";
        let state = "{";
        if (streamer.filename === "") {
            if (streamer.state === "Offline") {
                state += this.config.colors.offline + "-fg}";
            }
            else {
                state += this.config.colors.state + "-fg}";
            }
            state += streamer.state + (streamer.paused ? " [paused]" : "");
        }
        else {
            state += this.config.colors.file + "-fg}" + streamer.filename;
        }
        state += "{/}";
        const temp = streamer.isTemp ? ("{" + this.config.colors.state + "-fg}[temp]{/}") : "";
        return [name, temp, site.siteName, state];
    }
    populateTable(site, table) {
        let sortedKeys = [];
        const streamerList = site.streamerList;
        if (streamerList.size > 0) {
            // Map keys are UID, but want to sort list by name.
            sortedKeys = Array.from(streamerList.keys()).sort((a, b) => {
                const aStreamer = streamerList.get(a);
                const bStreamer = streamerList.get(b);
                if (aStreamer && bStreamer) {
                    if (aStreamer.nm < bStreamer.nm) {
                        return -1;
                    }
                    if (aStreamer.nm > bStreamer.nm) {
                        return 1;
                    }
                }
                return 0;
            });
        }
        for (const key of sortedKeys) {
            const streamer = streamerList.get(key);
            if (!streamer) {
                continue;
            }
            if (streamer.state === "Offline" && this.hideOffline) {
                continue;
            }
            table.push(this.buildListEntry(site, streamer));
        }
    }
    rebuildList() {
        const table = [];
        table.push(["", "", "", ""]);
        for (const site of this.SITES.values()) {
            this.populateTable(site, table);
        }
        this.list.setData(table);
    }
    render(redrawList, site) {
        if (redrawList) {
            this.rebuildList();
            if (site) {
                site.redrawList = false;
            }
        }
        this.screen.render();
    }
    // Add and remove streamers
    async updateList(siteName, nm, cmd, isTemp, pauseTimer) {
        for (const site of this.SITES.values()) {
            if (siteName === site.listName) {
                if (nm === "") {
                    if (cmd === site_1.UpdateCmd.PAUSE) {
                        site.pause();
                    }
                }
                else {
                    const id = {
                        uid: nm,
                        nm: nm,
                    };
                    try {
                        const dirty = await site.updateList(id, cmd, isTemp, pauseTimer) && !isTemp;
                        if (dirty) {
                            site.writeConfig();
                        }
                    }
                    catch (err) {
                        this.dvr.errMsg(err.toString());
                    }
                }
                return;
            }
        }
    }
}
exports.Tui = Tui;
//# sourceMappingURL=tui.js.map