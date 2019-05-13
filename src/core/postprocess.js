"use strict";
exports.__esModule = true;
var fs = require("fs");
var mv = require("mv");
var path = require("path");
var child_process_1 = require("child_process");
var colors = require("colors");
var PostProcess = /** @class */ (function () {
    function PostProcess(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }
    PostProcess.prototype.add = function (capInfo) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            this.convert();
        }
    };
    PostProcess.prototype.convert = function () {
        var _this = this;
        var capInfo = this.postProcessQ[0];
        var site = capInfo.site;
        var streamer = capInfo.streamer;
        var namePrint = streamer ? colors.name(streamer.nm) + " " : "";
        var fileType = this.config.recording.autoConvertType;
        var completeDir = this.getCompleteDir(site, streamer);
        var uniqueName = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        var completeFile = uniqueName + "." + fileType;
        var capPath = path.join(this.config.recording.captureDirectory, capInfo.filename + ".ts");
        var cmpPath = path.join(completeDir, completeFile);
        if (fileType === "ts") {
            this.dvr.dbgMsg(namePrint + " recording moved " + capPath + " to " + cmpPath);
            mv(capPath, cmpPath, function (err) {
                if (err) {
                    _this.dvr.errMsg(colors.site(capInfo.filename) + ": " + err.toString());
                }
            });
            this.postScript(site, streamer, completeDir, completeFile);
            return;
        }
        var script = this.dvr.calcPath(this.config.recording.postprocess);
        var args = [capPath, cmpPath, fileType];
        var myCompleteProcess = child_process_1.spawn(script, args);
        this.dvr.infoMsg(namePrint + " converting to " + fileType + ": " +
            (colors.cmd(script) + " " + colors.cmd(args.join(" "))), site);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, myCompleteProcess, true);
        }
        myCompleteProcess.on("close", function () {
            if (!_this.config.recording.keepTsFile) {
                if (fs.existsSync(args[0])) {
                    fs.unlinkSync(args[0]);
                }
                else {
                    _this.dvr.errMsg(args[0] + "does not exist, cannot remove");
                }
            }
            _this.dvr.infoMsg(namePrint + " done converting " + completeFile, site);
            _this.postScript(site, streamer, completeDir, completeFile);
        });
        myCompleteProcess.on("error", function (err) {
            _this.dvr.errMsg(err.toString());
        });
    };
    PostProcess.prototype.postScript = function (site, streamer, completeDir, completeFile) {
        var _this = this;
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
            return;
        }
        var script = this.dvr.calcPath(this.config.postprocess);
        var args = [completeDir, completeFile];
        var namePrint = streamer === null ? "" : colors.name(streamer.nm) + " ";
        this.dvr.infoMsg(namePrint + " running global postprocess script: " +
            (colors.cmd(script) + " " + colors.cmd(args.join(" "))), site);
        var userPostProcess = child_process_1.spawn(script, args);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, userPostProcess, true);
        }
        userPostProcess.on("close", function () {
            _this.dvr.infoMsg(namePrint + " done post-processing " + colors.file(completeFile), site);
            _this.nextConvert(site, streamer);
        });
    };
    PostProcess.prototype.nextConvert = function (site, streamer) {
        if (site && streamer) {
            site.clearProcessing(streamer);
        }
        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.convert();
        }
    };
    PostProcess.prototype.getCompleteDir = function (site, streamer) {
        if (site && streamer) {
            return site.getCompleteDir(streamer);
        }
        return this.dvr.mkdir(this.config.recording.completeDirectory + "/UNKNOWN");
    };
    PostProcess.prototype.uniqueFileName = function (completeDir, filename, fileType) {
        // If the output file already exists, make filename unique
        var count = 1;
        var fileinc = filename;
        var name = path.join(completeDir, fileinc + "." + fileType);
        while (fs.existsSync(name)) {
            this.dvr.errMsg(name + " already exists");
            fileinc = filename + " (" + count.toString() + ")";
            name = path.join(completeDir, fileinc + "." + fileType);
            count++;
        }
        return fileinc;
    };
    return PostProcess;
}());
exports.PostProcess = PostProcess;
