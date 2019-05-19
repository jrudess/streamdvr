"use strict";

import {Dvr, Config, MSG} from "./dvr";
import {Site, Id, Streamer, UpdateCmd} from "./site";
const blessed = require("neo-blessed");
const colors  = require("colors");

async function sleep(time: number): Promise<number> {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export class Tui {

    protected dvr: Dvr;
    protected config: Config;
    protected SITES: Map<string, Site>;
    protected hideOffline: boolean;
    protected listSelect: any;
    protected sitelistSelect: any;
    protected screen: any;
    protected list: any;
    protected sitelist: any;
    protected prompt: any;
    protected inputBar: any;
    protected listmenu: any;
    protected sitemenu: any;
    protected logbody: any;

    constructor(dvr: Dvr) {

        this.dvr = dvr;
        this.config = dvr.config;
        this.SITES = new Map();
        this.hideOffline = false;

        this.createTui();
    }

    protected createTui() {
        this.screen = blessed.screen({smartCSR: true, autoPadding: true, dockBorders: true});
        this.screen.title = "streamdvr";
        this.listSelect = null;
        this.sitelistSelect = null;

        this.list = blessed.listtable({
            top: 0,
            left: 0,
            width: 71,
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
            top: "100%-13",
            left: 0,
            width: 71,
            height: 12,
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
            left: 71,
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
            top: "100%-11",
            left: 18,
            width: 23,
            height: 7,
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
        this.screen.key(["q", "C-c"], () => (
            this.dvr.exit()
        ));

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

        this.list.on("selectrow", (item: any, index: number) => {
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
            for (const [, site] of this.SITES) {
                site.getStreamers();
            }
        });

        this.sitelist.on("selectrow", (item: any, index: number) => {
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

        this.listmenu.on("select", (item: any, index: number) => {
            switch (index) {
            case 0: // pause
                if (this.listSelect && this.listSelect.length >= 2) {
                    const site: string = blessed.helpers.stripTags(this.listSelect[2]).trim();
                    const name: string = blessed.helpers.stripTags(this.listSelect[0]).trim();
                    this.updateStreamerList(site, name, UpdateCmd.PAUSE);
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
                    const site: string = blessed.helpers.stripTags(this.listSelect[2]).trim();
                    const name: string = blessed.helpers.stripTags(this.listSelect[0]).trim();
                    this.updateStreamerList(site, name, UpdateCmd.REMOVE);
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

        this.sitemenu.on("select", (item: any, index: number) => {
            if (this.sitelistSelect && this.sitelistSelect.length >= 1) {
                const site: string = blessed.helpers.stripTags(this.sitelistSelect[0]).trim();
                switch (index) {
                case 0: // pause
                    this.updateSiteList(site, UpdateCmd.PAUSE);
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
                case 2: // enable/disable
                    this.updateSiteList(site, UpdateCmd.EN_DIS);
                    this.sitelist.focus();
                    this.sitelist.interactive = true;
                    this.sitemenu.hide();
                    this.render(false);
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
        this.listmenu.pushItem("pause timer");
        this.listmenu.pushItem("remove");
        this.listmenu.pushItem("toggle offline");
        this.listmenu.setScrollPerc(100);

        this.sitemenu.pushItem("pause");
        this.sitemenu.pushItem("add");
        this.sitemenu.pushItem("enable/disable");
        this.sitemenu.setScrollPerc(100);

        this.list.selected = 1;
        this.sitelist.selected = 1;

        // CLI
        this.inputBar.on("submit", (text: string) => {
            this.prompt.hide();
            this.inputBar.clearValue();
            this.inputBar.hide();

            if (this.list.interactive) {
                if (this.listSelect && this.listSelect.length >= 2) {
                    const site: string = blessed.helpers.stripTags(this.listSelect[2]).trim();
                    const name: string = blessed.helpers.stripTags(this.listSelect[0]).trim();
                    new Promise(async () => {
                        await this.updateStreamerList(site, name, UpdateCmd.PAUSE);
                        await this.updateStreamerList(site, name, UpdateCmd.PAUSE, false, Number(text));
                        return true;
                    });
                }
                this.listmenu.hide();
                this.list.focus();
                this.render(false);
                return;
            } else if (this.sitelist.interactive) {
                if (this.sitelistSelect) {
                    const site: string = blessed.helpers.stripTags(this.sitelistSelect[0]).trim();
                    this.updateStreamerList(site, text, UpdateCmd.ADD);
                }
                this.sitemenu.focus();
                this.render(false);
                return;
            }

            const tokens: Array<string> = text.split(" ");
            if (tokens.length !== 0) {
                this.parseCli(tokens);
            }

            this.logbody.focus();
            this.render(false);
        });
    }

    protected parseCli(tokens: Array<string>) {
        const temp: boolean  = tokens[0] === "addtemp";
        const pause: boolean = tokens[0] === "pause" || tokens[0] === "unpause";
        const add: boolean   = tokens[0] === "add" || tokens[0] === "addtemp";
        const siteName: string = tokens.length >= 1 ? tokens[1].toUpperCase() : "";

        switch (tokens[0]) {
        case "add":
        case "addtemp":
        case "remove":
        case "pause":
        case "unpause":
            const cmd: UpdateCmd = add   ? UpdateCmd.ADD :
                                   pause ? UpdateCmd.PAUSE :
                                           UpdateCmd.REMOVE;
            if (tokens.length >= 3) {
                const nm: string = tokens[2];
                new Promise(async () => {
                    await this.updateStreamerList(siteName, nm, cmd, temp);
                    if (pause && tokens.length >= 4) {
                        const pauseTimer: number = Number(tokens[3]);
                        await this.updateStreamerList(siteName, nm, cmd, temp, pauseTimer);
                    }
                    return true;
                });
            } else if (tokens.length === 2) {
                new Promise(async () => {
                    await this.updateSiteList(siteName, cmd);
                    return true;
                });
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

    public addSite(site: Site) {
        this.SITES.set(site.siteName, site);
        this.redrawSites();
    }

    public redrawSites() {
        const sitetable: Array<Array<string>> = [];
        sitetable.push(["", ""]);
        for (const [siteName, site] of this.SITES) {
            const encolor: string = site.config.enable ? this.config.colors.state : this.config.colors.cmd;
            sitetable.push([`{${encolor}-fg} ${siteName} {/}`, ""]);
        }
        this.sitelist.setData(sitetable);
    }

    public log(text: string) {
        this.logbody.pushLine(text);
        this.logbody.setScrollPerc(100);
        this.render(false);
    }

    protected buildListEntry(site: Site, streamer: Streamer) {
        const name  = "{" + this.config.colors.name + "-fg}" + streamer.nm + "{/}";
        let state = "{";
        if (streamer.filename === "") {
            if (streamer.state === "Offline") {
                state += this.config.colors.offline + "-fg}";
            } else {
                state += this.config.colors.state + "-fg}";
            }
            state += streamer.state + (streamer.paused ? " [paused]" : "");
        } else {
            state += this.config.colors.file + "-fg}" + streamer.filename;
        }
        state += "{/}";
        const temp: string = streamer.isTemp ? ("{" + this.config.colors.state + "-fg}[temp]{/}") : "";
        return [name, temp, site.siteName, state];
    }

    protected populateTable(site: Site, table: Array<Array<string>>) {
        let sortedKeys: Array<string> = [];
        const streamerList: Map<string, Streamer> = site.streamerList;
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
            const streamer: Streamer | undefined = streamerList.get(key);
            if (!streamer) {
                continue;
            }
            if (streamer.state === "Offline" && this.hideOffline) {
                continue;
            }
            table.push(this.buildListEntry(site, streamer));
        }
    }

    protected rebuildList() {
        const table: Array<Array<string>> = [];
        table.push(["", "", "", ""]);
        for (const site of this.SITES.values()) {
            this.populateTable(site, table);
        }
        this.list.setData(table);
    }

    public render(redrawList: boolean, site?: Site) {
        if (redrawList) {
            this.rebuildList();
            if (site) {
                site.redrawList = false;
            }
        }

        this.screen.render();
    }

    // Add and remove streamers
    protected async updateStreamerList(siteName: string, nm: string, cmd: UpdateCmd, isTemp?: boolean, pauseTimer?: number) {
        const site: Site | undefined = this.SITES.get(siteName);
        if (!site) {
            return;
        }
        const id: Id = {
            uid: nm,
            nm: nm,
        };
        try {
            const dirty: boolean = await site.updateList(id, cmd, isTemp, pauseTimer) && !isTemp;
            if (dirty) {
                site.writeConfig();
            }
        } catch (err) {
            this.dvr.print(MSG.ERROR, err.toString());
        }
    }

    protected async updateSiteList(siteName: string, cmd: UpdateCmd) {
        const site: Site | undefined = this.SITES.get(siteName);
        if (!site) {
            return;
        }

        switch (cmd) {
        case UpdateCmd.PAUSE:
            site.pause();
            break;
        case UpdateCmd.EN_DIS:
            if (site.config.enable) {
                site.print(MSG.DEBUG, "Site disabled");
                site.config.enable = false;
            } else {
                while (site.isRunning()) {
                    this.dvr.print(MSG.DEBUG, `${colors.site(siteName)} waiting for prior run to finish`);
                    await sleep(10 * 1000);
                }
                site.print(MSG.DEBUG, "Site enabled");
                site.config.enable = true;
                this.dvr.run(site);
            }
            this.redrawSites();
            this.render(true);
            site.writeConfig();
            break;
        }
        return;
    }

}
