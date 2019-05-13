"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var site_1 = require("./site");
var blessed = require("neo-blessed");
var colors = require("colors");
var Tui = /** @class */ (function () {
    function Tui(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.SITES = [];
        this.hideOffline = false;
        this.createTui();
    }
    Tui.prototype.createTui = function () {
        var _this = this;
        this.screen = blessed.screen({ smartCSR: true, autoPadding: true, dockBorders: true });
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
                left: 1
            },
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
            width: 71,
            height: 10,
            align: "left",
            interactive: false,
            keys: true,
            mouse: false,
            noCellBorders: true,
            tags: true,
            padding: {
                left: 1
            },
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
            left: 71,
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
                bg: "none"
            }
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
        this.screen.key("1", function () {
            _this.listmenu.hide();
            _this.sitemenu.hide();
            _this.sitelist.interactive = false;
            _this.list.interactive = true;
            _this.list.focus();
            _this.render(false);
        });
        this.screen.key("2", function () {
            _this.sitemenu.hide();
            _this.listmenu.hide();
            _this.list.interactive = false;
            _this.sitelist.interactive = true;
            _this.sitelist.focus();
            _this.render(false);
        });
        this.screen.key("pageup", function () {
            _this.screen.focused.scroll(-_this.screen.focused.height || -1);
            _this.render(false);
        });
        this.screen.key("pagedown", function () {
            _this.screen.focused.scroll(_this.screen.focused.height || 1);
            _this.render(false);
        });
        // Close on q, or ctrl+c
        // Note: tui.screen intercepts ctrl+c and it does not pass down to ffmpeg
        this.screen.key(["q", "C-c"], function () { return (_this.dvr.exit()); });
        this.logbody.key(["i", "enter"], function () {
            if (_this.screen.focused === _this.logbody) {
                _this.prompt.show();
                _this.inputBar.show();
                _this.inputBar.focus();
                _this.render(false);
            }
        });
        this.logbody.key(["j"], function () {
            _this.logbody.scroll(1);
            _this.render(false);
        });
        this.logbody.key(["k"], function () {
            _this.logbody.scroll(-1);
            _this.render(false);
        });
        this.list.on("selectrow", function (item, index) {
            _this.listSelect = index < _this.list.rows.length ?
                _this.list.rows[index] :
                null;
        });
        this.list.key(["j"], function () {
            _this.list.down(1);
            _this.render(false);
        });
        this.list.key(["k"], function () {
            _this.list.up(1);
            _this.render(false);
        });
        this.list.on("select", function () {
            _this.listmenu.show();
            _this.listmenu.focus();
            _this.render(false);
        });
        this.list.on("cancel", function () {
            _this.list.interactive = false;
            _this.logbody.focus();
            _this.render(false);
        });
        this.list.key("r", function () {
            for (var _i = 0, _a = _this.SITES; _i < _a.length; _i++) {
                var site = _a[_i];
                site.getStreamers();
            }
        });
        this.sitelist.on("selectrow", function (item, index) {
            _this.sitelistSelect = index < _this.sitelist.rows.length ?
                _this.sitelist.rows[index] :
                null;
        });
        this.sitelist.key(["j"], function () {
            _this.sitelist.down(1);
            _this.render(false);
        });
        this.sitelist.key(["k"], function () {
            _this.sitelist.up(1);
            _this.render(false);
        });
        this.sitelist.on("select", function () {
            _this.sitemenu.show();
            _this.sitemenu.focus();
            _this.render(false);
        });
        this.sitelist.on("cancel", function () {
            _this.sitelist.interactive = false;
            _this.logbody.focus();
            _this.render(false);
        });
        this.listmenu.key(["j"], function () {
            _this.listmenu.down(1);
            _this.render(false);
        });
        this.listmenu.key(["k"], function () {
            _this.listmenu.up(1);
            _this.render(false);
        });
        this.listmenu.on("select", function (item, index) {
            switch (index) {
                case 0: // pause
                    if (_this.listSelect && _this.listSelect.length >= 2) {
                        var site = blessed.helpers.stripTags(_this.listSelect[2]).toLowerCase();
                        var name_1 = blessed.helpers.stripTags(_this.listSelect[0]);
                        _this.updateList(site, name_1, site_1.UpdateCmd.PAUSE);
                        _this.listmenu.hide();
                        _this.list.focus();
                        _this.render(false);
                    }
                    break;
                case 1: // pause timer
                    _this.prompt.show();
                    _this.inputBar.show();
                    _this.inputBar.focus();
                    _this.render(false);
                    break;
                case 2: // remove
                    if (_this.listSelect && _this.listSelect.length >= 2) {
                        var site = blessed.helpers.stripTags(_this.listSelect[2]).toLowerCase();
                        var name_2 = blessed.helpers.stripTags(_this.listSelect[0]);
                        _this.updateList(site, name_2, site_1.UpdateCmd.REMOVE);
                        _this.listmenu.hide();
                        _this.list.focus();
                        _this.render(false);
                    }
                    break;
                case 3: // toggle offline
                    _this.hideOffline = !_this.hideOffline;
                    _this.listmenu.hide();
                    _this.list.interactive = true;
                    _this.list.focus();
                    _this.render(true);
                    _this.listSelect = _this.list.rows.length <= 1 ?
                        null :
                        _this.list.rows[1];
                    break;
            }
        });
        this.listmenu.on("cancel", function () {
            _this.listmenu.hide();
            _this.list.interactive = true;
            _this.list.focus();
            _this.render(false);
        });
        this.sitemenu.on("select", function (item, index) {
            if (_this.sitelistSelect && _this.sitelistSelect.length >= 1) {
                var site = blessed.helpers.stripTags(_this.sitelistSelect[0]).toLowerCase();
                switch (index) {
                    case 0: // pause
                        _this.updateList(site, "", site_1.UpdateCmd.PAUSE);
                        _this.sitelist.focus();
                        _this.sitelist.interactive = true;
                        _this.sitemenu.hide();
                        _this.render(false);
                        break;
                    case 1: // add
                        _this.prompt.show();
                        _this.inputBar.show();
                        _this.render(false);
                        _this.inputBar.focus();
                        break;
                }
            }
        });
        this.sitemenu.key(["j"], function () {
            _this.sitemenu.down(1);
            _this.render(false);
        });
        this.sitemenu.key(["k"], function () {
            _this.sitemenu.up(1);
            _this.render(false);
        });
        this.sitemenu.on("cancel", function () {
            _this.sitemenu.hide();
            _this.sitelist.interactive = true;
            _this.sitelist.focus();
            _this.render(false);
        });
        this.inputBar.on("cancel", function () {
            _this.prompt.hide();
            _this.inputBar.clearValue();
            _this.inputBar.hide();
            _this.render(false);
        });
        this.inputBar.key(["C-c"], function () { return (_this.dvr.exit()); });
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
        this.inputBar.on("submit", function (text) {
            _this.prompt.hide();
            _this.inputBar.clearValue();
            _this.inputBar.hide();
            if (_this.list.interactive) {
                if (_this.listSelect && _this.listSelect.length >= 2) {
                    var site_2 = blessed.helpers.stripTags(_this.listSelect[2]).toLowerCase();
                    var name_3 = blessed.helpers.stripTags(_this.listSelect[0]);
                    new Promise(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.updateList(site_2, name_3, site_1.UpdateCmd.PAUSE)];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, this.updateList(site_2, name_3, site_1.UpdateCmd.PAUSE, false, Number(text))];
                                case 2:
                                    _a.sent();
                                    return [2 /*return*/, true];
                            }
                        });
                    }); });
                }
                _this.listmenu.hide();
                _this.list.focus();
                _this.render(false);
                return;
            }
            else if (_this.sitelist.interactive) {
                if (_this.sitelistSelect) {
                    var site = blessed.helpers.stripTags(_this.sitelistSelect[0]).toLowerCase();
                    _this.updateList(site, text, site_1.UpdateCmd.ADD);
                }
                _this.sitemenu.focus();
                _this.render(false);
                return;
            }
            var tokens = text.split(" ");
            if (tokens.length !== 0) {
                _this.parseCli(tokens);
            }
            _this.logbody.focus();
            _this.render(false);
        });
    };
    Tui.prototype.parseCli = function (tokens) {
        var _this = this;
        var temp = tokens[0] === "addtemp";
        var pause = tokens[0] === "pause" || tokens[0] === "unpause";
        var add = tokens[0] === "add" || tokens[0] === "addtemp";
        switch (tokens[0]) {
            case "add":
            case "addtemp":
            case "remove":
            case "pause":
            case "unpause":
                var cmd_1 = add ? site_1.UpdateCmd.ADD :
                    pause ? site_1.UpdateCmd.PAUSE :
                        site_1.UpdateCmd.REMOVE;
                if (tokens.length >= 3) {
                    new Promise(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.updateList(tokens[1], tokens[2], cmd_1, temp)];
                                case 1:
                                    _a.sent();
                                    if (!(pause && tokens.length >= 4)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, this.updateList(tokens[1], tokens[2], cmd_1, temp, Number(tokens[3]))];
                                case 2:
                                    _a.sent();
                                    _a.label = 3;
                                case 3: return [2 /*return*/, true];
                            }
                        });
                    }); });
                }
                else if (tokens.length === 2) {
                    new Promise(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.updateList(tokens[1], "", cmd_1, temp)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/, true];
                            }
                        });
                    }); });
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
    };
    Tui.prototype.addSite = function (site) {
        this.SITES.push(site);
        var sitetable = [];
        sitetable.push(["", ""]);
        for (var _i = 0, _a = this.SITES; _i < _a.length; _i++) {
            var site_3 = _a[_i];
            sitetable.push(["{" + this.config.colors.state + "-fg}" + site_3.siteName + "{/}", ""]);
        }
        this.sitelist.setData(sitetable);
    };
    Tui.prototype.log = function (text) {
        this.logbody.pushLine(text);
        this.logbody.setScrollPerc(100);
        this.render(false);
    };
    Tui.prototype.buildListEntry = function (site, streamer) {
        var name = "{" + this.config.colors.name + "-fg}" + streamer.nm + "{/}";
        var state = "{";
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
        var temp = streamer.isTemp ? ("{" + this.config.colors.state + "-fg}[temp]{/}") : "";
        return [name, temp, site.siteName, state];
    };
    Tui.prototype.populateTable = function (site, table) {
        var sortedKeys = [];
        var streamerList = site.streamerList;
        if (streamerList.size > 0) {
            // Map keys are UID, but want to sort list by name.
            sortedKeys = Array.from(streamerList.keys()).sort(function (a, b) {
                var aStreamer = streamerList.get(a);
                var bStreamer = streamerList.get(b);
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
        for (var _i = 0, sortedKeys_1 = sortedKeys; _i < sortedKeys_1.length; _i++) {
            var key = sortedKeys_1[_i];
            var streamer = streamerList.get(key);
            if (!streamer) {
                continue;
            }
            if (streamer.state === "Offline" && this.hideOffline) {
                continue;
            }
            table.push(this.buildListEntry(site, streamer));
        }
    };
    Tui.prototype.rebuildList = function () {
        var table = [];
        table.push(["", "", "", ""]);
        for (var _i = 0, _a = this.SITES.values(); _i < _a.length; _i++) {
            var site = _a[_i];
            this.populateTable(site, table);
        }
        this.list.setData(table);
    };
    Tui.prototype.render = function (redrawList, site) {
        if (redrawList) {
            this.rebuildList();
            if (site) {
                site.redrawList = false;
            }
        }
        this.screen.render();
    };
    // Add and remove streamers
    Tui.prototype.updateList = function (siteName, nm, cmd, isTemp, pauseTimer) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, site, id, dirty, err_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _i = 0, _a = this.SITES.values();
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 8];
                        site = _a[_i];
                        if (!(siteName === site.listName)) return [3 /*break*/, 7];
                        if (!(nm === "")) return [3 /*break*/, 2];
                        if (cmd === site_1.UpdateCmd.PAUSE) {
                            site.pause();
                        }
                        return [3 /*break*/, 6];
                    case 2:
                        id = {
                            uid: nm,
                            nm: nm
                        };
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, site.updateList(id, cmd, isTemp, pauseTimer)];
                    case 4:
                        dirty = (_b.sent()) && !isTemp;
                        if (dirty) {
                            site.writeConfig();
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        err_1 = _b.sent();
                        this.dvr.errMsg(err_1.toString());
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                    case 7:
                        _i++;
                        return [3 /*break*/, 1];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    return Tui;
}());
exports.Tui = Tui;
