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
var path = require("path");
var yaml = require("js-yaml");
var child_process_1 = require("child_process");
var colors = require("colors");
function sleep(time) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, time); })];
        });
    });
}
var UpdateCmd;
(function (UpdateCmd) {
    UpdateCmd[UpdateCmd["REMOVE"] = 0] = "REMOVE";
    UpdateCmd[UpdateCmd["ADD"] = 1] = "ADD";
    UpdateCmd[UpdateCmd["PAUSE"] = 2] = "PAUSE";
})(UpdateCmd = exports.UpdateCmd || (exports.UpdateCmd = {}));
var Site = /** @class */ (function () {
    function Site(siteName, dvr, tui) {
        this.siteName = siteName;
        this.dvr = dvr;
        this.tui = tui;
        this.padName = siteName.padEnd(8, " ");
        this.listName = siteName.toLowerCase();
        this.cfgFile = path.join(dvr.configdir, this.listName + ".yml");
        this.updateName = path.join(dvr.configdir, this.listName + "_updates.yml");
        this.config = yaml.safeLoad(fs.readFileSync(this.cfgFile, "utf8"));
        this.streamerList = new Map(); // Refer to addStreamer() for JSON entries
        this.redrawList = false;
        this.paused = false;
        this.pauseIndex = 1;
        if (dvr.config.tui.enable) {
            tui.addSite(this);
        }
        this.infoMsg(this.config.streamers.length.toString() + " streamer(s) in config");
        if (typeof this.config.siteUrl === "undefined") {
            this.errMsg(this.cfgFile + " is missing siteUrl");
        }
    }
    Site.prototype.getStreamerList = function () {
        return Array.from(this.streamerList.values());
    };
    Site.prototype.getFileName = function (nm) {
        var filename = this.dvr.config.recording.fileNameFormat ? this.dvr.config.recording.fileNameFormat : "%n_%s_%d";
        filename = filename.replace(/%s/gi, this.listName);
        filename = filename.replace(/%n/gi, nm);
        filename = filename.replace(/%d/gi, this.dvr.getDateTime());
        return filename;
    };
    Site.prototype.checkFileSize = function () {
        var maxSize = this.dvr.config.recording.maxSize;
        for (var _i = 0, _a = this.streamerList.values(); _i < _a.length; _i++) {
            var streamer = _a[_i];
            if (streamer.capture === null || streamer.postProcess) {
                continue;
            }
            var stat = fs.statSync(path.join(this.dvr.config.recording.captureDirectory, streamer.filename));
            var sizeMB = Math.round(stat.size / 1048576);
            this.dbgMsg(colors.file(streamer.filename) + ", size=" + sizeMB.toString() + "MB, maxSize=" + maxSize.toString() + "MB");
            if (sizeMB === streamer.filesize) {
                this.infoMsg(colors.name(streamer.nm) + " recording appears to be stuck (counter=" +
                    (streamer.stuckcounter.toString() + "), file size is not increasing: " + sizeMB.toString() + "MB"));
                streamer.stuckcounter++;
            }
            else {
                streamer.filesize = sizeMB;
            }
            if (streamer.stuckcounter >= 2) {
                this.infoMsg(colors.name(streamer.nm) + " terminating stuck recording");
                this.haltCapture(streamer.uid);
                streamer.stuckcounter = 0;
                this.redrawList = true;
            }
            else if (maxSize !== 0 && sizeMB >= maxSize) {
                this.infoMsg(colors.name(streamer.nm) + " recording has exceeded file size limit (size=" +
                    (sizeMB.toString() + " > maxSize=" + maxSize.toString() + ")"));
                this.haltCapture(streamer.uid);
                this.redrawList = true;
            }
        }
    };
    Site.prototype.getCaptureArguments = function (url, filename, params) {
        var args = [
            "-o",
            path.join(this.dvr.config.recording.captureDirectory, filename + ".ts"),
            "-s",
            url,
        ];
        if (this.dvr.config.proxy.enable) {
            args.push("-P");
            args.push(this.dvr.config.proxy.server);
        }
        if (this.dvr.config.debug.recorder) {
            args.push("-d");
        }
        if (this.config.username) {
            args.push("--" + this.listName + "-username=" + this.config.username);
        }
        if (this.config.password) {
            args.push("--" + this.listName + "-password=" + this.config.password);
        }
        if (params) {
            args = args.concat(params);
        }
        return args;
    };
    Site.prototype.processUpdates = function (cmd) {
        return __awaiter(this, void 0, void 0, function () {
            var updates, list, dirty, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!fs.existsSync(this.updateName)) {
                            this.dbgMsg(this.updateName + " does not exist");
                            return [2 /*return*/];
                        }
                        updates = yaml.safeLoad(fs.readFileSync(this.updateName, "utf8"));
                        list = [];
                        if (cmd === UpdateCmd.ADD) {
                            if (updates.include && updates.include.length > 0) {
                                this.infoMsg(updates.include.length + " streamer(s) to include");
                                list = updates.include;
                                updates.include = [];
                            }
                        }
                        else if (cmd === UpdateCmd.REMOVE) {
                            if (updates.exclude && updates.exclude.length > 0) {
                                this.infoMsg(updates.exclude.length + " streamer(s) to exclude");
                                list = updates.exclude;
                                updates.exclude = [];
                            }
                        }
                        // clear the processed array from file
                        if (list.length > 0) {
                            fs.writeFileSync(this.updateName, yaml.safeDump(updates), "utf8");
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.updateStreamers(list, cmd)];
                    case 2:
                        dirty = _a.sent();
                        if (dirty) {
                            this.writeConfig();
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _a.sent();
                        this.errMsg(err_1.toString());
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    Site.prototype.updateList = function (id, cmd, isTemp, pauseTimer) {
        return __awaiter(this, void 0, void 0, function () {
            var dirty;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dirty = false;
                        if (!(cmd === UpdateCmd.PAUSE)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.pauseStreamer(id, pauseTimer)];
                    case 1:
                        dirty = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        if (cmd === UpdateCmd.ADD) {
                            dirty = this.addStreamer(id, isTemp);
                        }
                        else if (cmd === UpdateCmd.REMOVE) {
                            dirty = this.removeStreamer(id);
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/, dirty];
                }
            });
        });
    };
    Site.prototype.updateStreamers = function (list, cmd) {
        return __awaiter(this, void 0, void 0, function () {
            var dirty, _i, list_1, entry, id;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dirty = false;
                        _i = 0, list_1 = list;
                        _a.label = 1;
                    case 1:
                        if (!(_i < list_1.length)) return [3 /*break*/, 4];
                        entry = list_1[_i];
                        this.dbgMsg("updateStreamers: uid = " + entry);
                        id = {
                            uid: entry,
                            nm: entry
                        };
                        return [4 /*yield*/, this.updateList(id, cmd)];
                    case 2:
                        dirty = (_a.sent()) || dirty;
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, dirty];
                }
            });
        });
    };
    Site.prototype.addStreamer = function (id, isTemp) {
        var added = true;
        for (var _i = 0, _a = this.config.streamers; _i < _a.length; _i++) {
            var entry = _a[_i];
            if (entry[0] === id.uid) {
                this.errMsg(colors.name(id.nm) + " is already in the capture list");
                added = false;
                break;
            }
        }
        if (added) {
            this.infoMsg(colors.name(id.nm) + " added to capture list" + (isTemp ? " (temporarily)" : ""));
            if (!isTemp) {
                this.config.streamers.push(this.createListItem(id));
            }
        }
        if (!this.streamerList.has(id.uid)) {
            var streamer = {
                uid: id.uid,
                nm: id.nm,
                site: this.padName,
                state: "Offline",
                filename: "",
                capture: null,
                postProcess: false,
                filesize: 0,
                stuckcounter: 0,
                paused: this.paused,
                isTemp: isTemp ? true : false
            };
            this.streamerList.set(id.uid, streamer);
            this.render(true);
            this.refresh(streamer);
        }
        return added;
    };
    Site.prototype.removeStreamer = function (id) {
        if (this.streamerList.has(id.uid)) {
            this.infoMsg(colors.name(id.nm) + " removed from capture list.");
            this.haltCapture(id.uid);
            this.streamerList["delete"](id.uid); // Note: deleting before recording/post-processing finishes
            this.render(true);
            for (var i = 0; i < this.config.streamers.length; i++) {
                if (this.config.streamers[i][0] === id.uid) {
                    this.config.streamers.splice(i, 1);
                    break;
                }
            }
            return true;
        }
        this.errMsg(colors.name(id.nm) + " not in capture list.");
        return false;
    };
    Site.prototype.pauseStreamer = function (id, pauseTimer) {
        return __awaiter(this, void 0, void 0, function () {
            var dirty, streamer, print_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dirty = false;
                        streamer = this.streamerList.get(id.uid);
                        if (!(streamer && pauseTimer && pauseTimer > 0)) return [3 /*break*/, 2];
                        print_1 = streamer.paused ? " pausing for " : " unpausing for ";
                        this.infoMsg(colors.name(id.nm) + " " + print_1 + " " + pauseTimer.toString() + " seconds");
                        return [4 /*yield*/, sleep(pauseTimer * 1000)];
                    case 1:
                        _a.sent();
                        this.infoMsg(colors.name(id.nm) + " pause-timer expired");
                        streamer = this.streamerList.get(id.uid);
                        _a.label = 2;
                    case 2:
                        if (streamer) {
                            dirty = this.togglePause(streamer);
                            this.render(true);
                        }
                        return [2 /*return*/, dirty];
                }
            });
        });
    };
    Site.prototype.pause = function () {
        this.paused = !this.paused;
        for (var _i = 0, _a = this.streamerList; _i < _a.length; _i++) {
            var _b = _a[_i], streamer = _b[1];
            streamer.paused = this.paused;
            if (this.paused) {
                this.haltCapture(streamer.uid);
            }
            else if (streamer.state !== "Offline") {
                this.refresh(streamer);
            }
        }
        this.render(true);
    };
    Site.prototype.togglePause = function (streamer) {
        if (streamer.paused) {
            this.infoMsg(colors.name(streamer.nm) + " is unpaused.");
            streamer.paused = false; // must be set before calling refresh()
            this.refresh(streamer);
        }
        else {
            this.infoMsg(colors.name(streamer.nm) + " is paused.");
            streamer.paused = true;
            this.haltCapture(streamer.uid);
        }
        for (var _i = 0, _a = this.config.streamers; _i < _a.length; _i++) {
            var item = _a[_i];
            if (item[0] === streamer.uid) {
                item[this.pauseIndex] = item[this.pauseIndex] === "paused" ? "unpaused" : "paused";
                return true;
            }
        }
        return false;
    };
    Site.prototype.checkStreamerState = function (streamer, options) {
        if (!options) {
            this.errMsg("site::checkStreamerState() options input is undefined");
            return;
        }
        if (streamer.state !== options.prevState) {
            this.infoMsg(options.msg);
            this.redrawList = true;
        }
        if (streamer.postProcess === false && streamer.capture !== null && !options.isStreaming) {
            // Sometimes the recording process doesn't end when a streamer
            // stops broadcasting, so terminate it.
            this.dbgMsg(colors.name(streamer.nm) + " is no longer broadcasting, terminating capture process (pid=" + streamer.capture.pid.toString() + ")");
            this.haltCapture(streamer.uid);
            this.redrawList = true;
        }
        if (options.isStreaming) {
            if (streamer.paused) {
                this.dbgMsg(colors.name(streamer.nm) + " is paused, recording not started.");
            }
            else if (this.canStartCap(streamer.uid)) {
                this.startCapture(this.setupCapture(streamer, options.m3u8));
            }
        }
        this.render(false);
    };
    Site.prototype.getStreamers = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.dvr.tryingToExit) {
                    this.dbgMsg("Skipping lookup while exit in progress...");
                    return [2 /*return*/, false];
                }
                this.checkFileSize();
                return [2 /*return*/, true];
            });
        });
    };
    Site.prototype.storeCapInfo = function (streamer, filename, capture, isPostProcess) {
        streamer.filename = filename;
        streamer.capture = capture;
        if (isPostProcess) {
            streamer.postProcess = true;
            this.redrawList = true;
        }
        this.render(true);
    };
    Site.prototype.getNumCapsInProgress = function () {
        var count = 0;
        for (var _i = 0, _a = this.streamerList.values(); _i < _a.length; _i++) {
            var streamer = _a[_i];
            if (streamer.capture) {
                count++;
            }
        }
        return count;
    };
    Site.prototype.haltAllCaptures = function () {
        for (var _i = 0, _a = this.streamerList.values(); _i < _a.length; _i++) {
            var streamer = _a[_i];
            // Don't kill post-process jobs, or recording can get lost.
            if (streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    };
    Site.prototype.haltCapture = function (uid) {
        if (this.streamerList.has(uid)) {
            var streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null && streamer.postProcess === false) {
                streamer.capture.kill("SIGINT");
            }
        }
    };
    Site.prototype.writeConfig = function () {
        var fd = fs.openSync(this.cfgFile, "w");
        this.dbgMsg("Rewriting " + this.cfgFile);
        fs.writeFileSync(fd, yaml.safeDump(this.config));
        fs.closeSync(fd);
    };
    Site.prototype.canStartCap = function (uid) {
        if (this.streamerList.has(uid)) {
            var streamer = this.streamerList.get(uid);
            if (streamer && streamer.capture !== null) {
                this.dbgMsg(colors.name(streamer.nm) + " is already capturing");
                return false;
            }
            return true;
        }
        return false;
    };
    Site.prototype.getCompleteDir = function (streamer) {
        var completeDir = this.dvr.config.recording.completeDirectory;
        if (this.dvr.config.recording.siteSubdir) {
            completeDir += "/" + this.siteName;
        }
        if (this.dvr.config.recording.streamerSubdir) {
            completeDir += "/" + streamer.nm;
            if (this.dvr.config.recording.includeSiteInDir) {
                completeDir += "_" + this.listName;
            }
            fs.mkdirSync(completeDir, { recursive: true });
        }
        return completeDir;
    };
    Site.prototype.refresh = function (streamer) {
        if (!this.dvr.tryingToExit && this.streamerList.has(streamer.uid)) {
            this.checkStreamerState(streamer);
        }
    };
    Site.prototype.startCapture = function (capInfo) {
        var _this = this;
        if (!capInfo || !capInfo.streamer || capInfo.spawnArgs.length === 0) {
            return;
        }
        var streamer = capInfo.streamer;
        var script = this.dvr.calcPath(this.config.recorder);
        var capture = child_process_1.spawn(script, capInfo.spawnArgs);
        this.dbgMsg("Starting recording: " + colors.cmd(script) + " " + colors.cmd(capInfo.spawnArgs.join(" ")));
        if (this.dvr.config.debug.recorder) {
            var logStream = fs.createWriteStream("." + capInfo.filename + ".log", { flags: "w" });
            capture.stdout.pipe(logStream);
            capture.stderr.pipe(logStream);
        }
        if (capture.pid) {
            var filename = capInfo.filename + ".ts";
            this.infoMsg(colors.name(streamer.nm) + " recording started: " + colors.file(filename));
            this.storeCapInfo(streamer, filename, capture, false);
        }
        else {
            this.errMsg(colors.name(streamer.nm) + " capture failed to start");
        }
        capture.on("close", function () {
            _this.endCapture(streamer, capInfo);
        });
    };
    Site.prototype.endCapture = function (streamer, capInfo) {
        var fullname = capInfo.filename + ".ts";
        try {
            var stats = fs.statSync(path.join(this.dvr.config.recording.captureDirectory, fullname));
            if (stats) {
                var sizeMB = stats.size / 1048576;
                if (sizeMB < this.dvr.config.recording.minSize) {
                    this.infoMsg(colors.name(streamer.nm) + " recording automatically deleted (size=" + sizeMB.toString() +
                        ("< minSize=" + this.dvr.config.recording.minSize.toString() + ")"));
                    fs.unlinkSync(path.join(this.dvr.config.recording.captureDirectory, fullname));
                    this.storeCapInfo(streamer, "", null, false);
                }
                else {
                    this.dvr.postProcess.add({ site: this, streamer: streamer, filename: capInfo.filename, spawnArgs: [] });
                }
            }
        }
        catch (err) {
            if (err.code === "ENOENT") {
                this.errMsg(colors.name(streamer.nm) + ", " + colors.file(capInfo.filename) + ".ts not found " +
                    ("in capturing directory, cannot convert to " + this.dvr.config.recording.autoConvertType));
            }
            else {
                this.errMsg(colors.name(streamer.nm) + ": " + err.toString());
            }
            this.storeCapInfo(streamer, "", null, false);
        }
        this.refresh(streamer);
    };
    Site.prototype.clearProcessing = function (streamer) {
        // Note: setting postProcess to undefined releases program to exit
        this.storeCapInfo(streamer, "", null, false);
        this.redrawList = true;
        streamer.postProcess = false;
        this.refresh(streamer);
    };
    Site.prototype.render = function (redrawList) {
        if (this.dvr.config.tui.enable) {
            this.tui.render(redrawList || this.redrawList, this);
        }
    };
    Site.prototype.infoMsg = function (msg) {
        this.dvr.infoMsg(msg, this);
    };
    Site.prototype.errMsg = function (msg) {
        this.dvr.errMsg(msg, this);
    };
    Site.prototype.dbgMsg = function (msg) {
        this.dvr.dbgMsg(msg, this);
    };
    return Site;
}());
exports.Site = Site;
