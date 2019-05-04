"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const mv = require("mv");
const { spawn } = require("child_process");
const colors = require("colors");
class PostProcess {
    constructor(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }
    add(capInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            this.postProcessQ.push(capInfo);
            if (this.postProcessQ.length === 1) {
                yield this.convert();
            }
        });
    }
    convert() {
        return __awaiter(this, void 0, void 0, function* () {
            const capInfo = this.postProcessQ[0];
            const site = capInfo.site === null ? this.dvr : capInfo.site;
            const streamer = capInfo.streamer;
            const namePrint = streamer === null ? "" : streamer.nm.name + " ";
            const capDir = this.config.recording.captureDirectory + "/";
            const capFile = capInfo.filename + ".ts";
            const fileType = this.config.recording.autoConvertType;
            const completeDir = (yield this.getCompleteDir(site, streamer)) + "/";
            const uniqueName = this.uniqueFileName(completeDir, capInfo.filename, fileType);
            const completeFile = uniqueName + "." + fileType;
            if (fileType === "ts") {
                site.dbgMsg(namePrint + "recording moved " +
                    capDir + capFile + " to " + completeDir + completeFile);
                mv(capDir + capFile, completeDir + completeFile, (err) => {
                    if (err) {
                        this.dvr.errMsg(capInfo.filename.site + ": " + err.toString());
                    }
                });
                yield this.postScript(site, streamer, completeDir, completeFile);
                return;
            }
            const script = this.dvr.calcPath(this.config.recording.postprocess);
            const args = [
                capDir + capFile,
                completeDir + completeFile,
                fileType,
            ];
            site.infoMsg(namePrint + "converting to " + fileType + ": " +
                script.cmd + " " + colors.cmd(args.join(" ")));
            if (site !== this.dvr) {
                site.storeCapInfo(streamer, uniqueName, null, true);
            }
            const myCompleteProcess = spawn(script, args);
            myCompleteProcess.on("close", () => {
                if (!this.config.recording.keepTsFile) {
                    fs.unlinkSync(args[0]);
                }
                site.infoMsg(namePrint + "done converting " + completeFile);
                this.postScript(site, streamer, completeDir, completeFile);
            });
            myCompleteProcess.on("error", (err) => {
                this.dvr.errMsg(err.toString());
            });
        });
    }
    postScript(site, streamer, completeDir, completeFile) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.config.postprocess) {
                yield this.nextConvert(site, streamer);
                return;
            }
            const script = this.dvr.calcPath(this.config.postprocess);
            const args = [completeDir, completeFile];
            const namePrint = streamer === null ? "" : streamer.nm.name + " ";
            site.infoMsg(namePrint + "running global postprocess script: " +
                script.cmd + " " + colors.cmd(args.join(" ")));
            const userPostProcess = spawn(script, args);
            userPostProcess.on("close", () => {
                site.infoMsg(namePrint + "done post-processing " + colors.file(completeFile));
                this.nextConvert(site, streamer);
            });
        });
    }
    nextConvert(site, streamer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (site !== this.dvr) {
                site.clearProcessing(streamer);
            }
            // Pop current job, and start next conversion job (if any)
            this.postProcessQ.shift();
            if (this.postProcessQ.length > 0) {
                yield this.convert();
            }
        });
    }
    getCompleteDir(site, streamer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (streamer) {
                const dir = yield site.getCompleteDir(streamer);
                return dir;
            }
            return this.dvr.mkdir(this.config.recording.completeDirectory + "/UNKNOWN");
        });
    }
    uniqueFileName(completeDir, filename, fileType) {
        // If the output file already exists, make filename unique
        let count = 1;
        let fileinc = filename;
        let name = completeDir + fileinc + "." + fileType;
        while (fs.existsSync(name)) {
            this.dvr.errMsg(name + " already exists");
            fileinc = filename + " (" + count + ")";
            name = completeDir + fileinc + "." + fileType;
            count++;
        }
        return fileinc;
    }
}
exports.PostProcess = PostProcess;
//# sourceMappingURL=postprocess.js.map