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
var fs = require("fs");
var moment = require("moment");
var path = require("path");
var yaml = require("js-yaml");
var postprocess_1 = require("./postprocess");
var site_1 = require("./site");
var tui_1 = require("./tui");
var colors = require("colors");
function sleep(time) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, time); })];
        });
    });
}
var MSG;
(function (MSG) {
    MSG[MSG["INFO"] = 0] = "INFO";
    MSG[MSG["DEBUG"] = 1] = "DEBUG";
    MSG[MSG["ERROR"] = 2] = "ERROR";
})(MSG = exports.MSG || (exports.MSG = {}));
var Dvr = /** @class */ (function () {
    function Dvr(dir) {
        this.path = dir;
        this.tryingToExit = false;
        this.configdir = "";
        this.configfile = this.findConfig();
        var config = fs.readFileSync(this.configfile, "utf8");
        this.config = yaml.safeLoad(config);
        this.loadConfig();
        if (this.config.log.enable) {
            var Console_1 = require("console").Console;
            var attr = this.config.log.append ? "a" : "w";
            var logFile = fs.createWriteStream("./streamdvr.log", { flags: attr });
            this.logger = new Console_1({ stdout: logFile, stderr: logFile });
        }
        if (this.config.tui.enable) {
            this.tui = new tui_1.Tui(this);
        }
        this.postProcess = new postprocess_1.PostProcess(this);
    }
    Dvr.prototype.findConfig = function () {
        var checkHome = 1;
        if (process.env.XDG_CONFIG_HOME) {
            this.configdir = path.join(process.env.XDG_CONFIG_HOME, "streamdvr");
            if (fs.existsSync(path.join(this.configdir, "config.yml"))) {
                checkHome = 0;
            }
        }
        if (checkHome) {
            this.configdir = process.env.HOME + "/.config/streamdvr";
            console.log(this.configdir);
        }
        if (!fs.existsSync(path.join(this.configdir, "config.yml"))) {
            this.configdir = "./config/";
        }
        var configfile = path.join(this.configdir, "config.yml");
        if (!fs.existsSync(configfile)) {
            console.log("ERROR: Could not find config.yml");
            process.exit(1);
        }
        return configfile;
    };
    Dvr.prototype.loadConfig = function () {
        try {
            this.config = yaml.safeLoad(fs.readFileSync(this.configfile, "utf8"));
        }
        catch (err) {
            console.log("ERROR: Failed to load config.yml: " + err.toString());
            process.exit(1);
        }
        colors.setTheme({
            name: this.config.colors.name,
            state: this.config.colors.state,
            offline: this.config.colors.offline,
            prompt: this.config.colors.prompt,
            file: this.config.colors.file,
            time: this.config.colors.time,
            site: this.config.colors.site,
            cmd: this.config.colors.cmd,
            debug: this.config.colors.debug,
            error: this.config.colors.error
        });
        this.config.recording.captureDirectory = this.mkdir(this.config.recording.captureDirectory);
        this.config.recording.completeDirectory = this.mkdir(this.config.recording.completeDirectory);
        if (this.config.tui.enable && this.tui) {
            this.tui.render(false);
        }
    };
    Dvr.prototype.mkdir = function (dir) {
        var fulldir = path.resolve(dir);
        fs.mkdirSync(fulldir, { recursive: true });
        return fulldir;
    };
    Dvr.prototype.calcPath = function (file) {
        // Check if file is relative or absolute
        if (file.charAt(0) !== "/") {
            return this.path + "/" + file;
        }
        return file;
    };
    Dvr.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var allfiles, tsfiles, _i, _a, ts, capInfo;
            return __generator(this, function (_b) {
                allfiles = fs.readdirSync(this.config.recording.captureDirectory);
                tsfiles = allfiles.filter(function (x) { return x.match(/.*\.ts$/ig); });
                for (_i = 0, _a = tsfiles.values(); _i < _a.length; _i++) {
                    ts = _a[_i];
                    capInfo = {
                        site: null,
                        streamer: null,
                        filename: ts.slice(0, -3),
                        spawnArgs: []
                    };
                    this.postProcess.add(capInfo);
                }
                return [2 /*return*/];
            });
        });
    };
    Dvr.prototype.run = function (site) {
        return __awaiter(this, void 0, void 0, function () {
            var err_1, interval;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 10];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, site.disconnect()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, site.connect()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, site.processUpdates(site_1.UpdateCmd.ADD)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, site.processUpdates(site_1.UpdateCmd.REMOVE)];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, site.getStreamers()];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        err_1 = _a.sent();
                        site.errMsg(err_1.toString());
                        return [3 /*break*/, 8];
                    case 8:
                        interval = site.config.scanInterval ? site.config.scanInterval : 300;
                        return [4 /*yield*/, sleep(interval * 1000)];
                    case 9:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    Dvr.prototype.getDateTime = function () {
        return moment().format(this.config.recording.dateFormat);
    };
    Dvr.prototype.log = function (text, options) {
        if (this.config.tui.enable && this.tui) {
            this.tui.log(text);
        }
        else if (options && options.trace && this.config.debug.errortrace) {
            console.trace(text);
        }
        else if (!this.config.enable.daemon) {
            console.log(text);
        }
        if (this.logger) {
            this.logger.log(text);
        }
    };
    Dvr.prototype.msg = function (msg, site, options) {
        var time = "[" + this.getDateTime() + "]";
        if (site) {
            this.log(colors.time(time) + " " + colors.site(site.padName) + " " + msg, options);
        }
        else {
            var outmsg = "DVR".padEnd(8, " ");
            outmsg = colors.time(time) + " " + colors.site(outmsg) + " " + msg;
            this.log(outmsg, options);
        }
    };
    Dvr.prototype.infoMsg = function (msg, site) {
        this.msg(msg, site);
    };
    Dvr.prototype.errMsg = function (msg, site) {
        this.msg(colors.error("[ERROR]") + " " + msg, site, { trace: true });
    };
    Dvr.prototype.dbgMsg = function (msg, site) {
        if (this.config.debug.log) {
            this.msg(colors.debug("[DEBUG]") + " " + msg, site);
        }
    };
    return Dvr;
}());
exports.Dvr = Dvr;
