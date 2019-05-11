"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const mv = require("mv");
const child_process_1 = require("child_process");
const colors = require("colors");
class PostProcess {
    constructor(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }
    add(capInfo) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            this.convert();
        }
    }
    convert() {
        const capInfo = this.postProcessQ[0];
        const site = capInfo.site;
        const streamer = capInfo.streamer;
        const namePrint = streamer ? `${colors.name(streamer.nm)}` + " " : "";
        const capDir = this.config.recording.captureDirectory + "/";
        const capFile = capInfo.filename + ".ts";
        const fileType = this.config.recording.autoConvertType;
        const completeDir = this.getCompleteDir(site, streamer) + "/";
        const uniqueName = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        const completeFile = uniqueName + "." + fileType;
        if (fileType === "ts") {
            this.dvr.dbgMsg(namePrint + "recording moved " +
                capDir + capFile + " to " + completeDir + completeFile);
            mv(capDir + capFile, completeDir + completeFile, (err) => {
                if (err) {
                    this.dvr.errMsg(`${colors.site(capInfo.filename)}` + ": " + `${err.toString()}`);
                }
            });
            this.postScript(site, streamer, completeDir, completeFile);
            return;
        }
        const script = this.dvr.calcPath(this.config.recording.postprocess);
        const args = [
            capDir + capFile,
            completeDir + completeFile,
            fileType,
        ];
        this.dvr.infoMsg(namePrint + "converting to " + fileType + ": " +
            `${colors.cmd(script)}` + " " + `${colors.cmd(args.join(" "))}`, site);
        if (site && streamer) {
            site.storeCapInfo(streamer, uniqueName, null, true);
        }
        const myCompleteProcess = child_process_1.spawn(script, args);
        if (streamer) {
            streamer.capture = myCompleteProcess;
        }
        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                if (fs.existsSync(args[0])) {
                    fs.unlinkSync(args[0]);
                }
                else {
                    this.dvr.errMsg(args[0] + "does not exist, cannot remove");
                }
            }
            this.dvr.infoMsg(namePrint + "done converting " + completeFile, site);
            this.postScript(site, streamer, completeDir, completeFile);
        });
        myCompleteProcess.on("error", (err) => {
            this.dvr.errMsg(err.toString());
        });
    }
    postScript(site, streamer, completeDir, completeFile) {
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
            return;
        }
        const script = this.dvr.calcPath(this.config.postprocess);
        const args = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : `${colors.name(streamer.nm)}` + " ";
        this.dvr.infoMsg(namePrint + "running global postprocess script: " + `${colors.cmd(script)}` +
            " " + `${colors.cmd(args.join(" "))}`, site);
        const userPostProcess = child_process_1.spawn(script, args);
        userPostProcess.on("close", () => {
            this.dvr.infoMsg(namePrint + "done post-processing " + `${colors.file(completeFile)}`, site);
            this.nextConvert(site, streamer);
        });
    }
    nextConvert(site, streamer) {
        if (site && streamer) {
            site.clearProcessing(streamer);
        }
        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.convert();
        }
    }
    getCompleteDir(site, streamer) {
        if (site && streamer) {
            return site.getCompleteDir(streamer);
        }
        return this.dvr.mkdir(this.config.recording.completeDirectory + "/UNKNOWN");
    }
    uniqueFileName(completeDir, filename, fileType) {
        // If the output file already exists, make filename unique
        let count = 1;
        let fileinc = filename;
        let name = completeDir + fileinc + "." + fileType;
        while (fs.existsSync(name)) {
            this.dvr.errMsg(name + " already exists");
            fileinc = filename + " (" + count.toString() + ")";
            name = completeDir + fileinc + "." + fileType;
            count++;
        }
        return fileinc;
    }
}
exports.PostProcess = PostProcess;
//# sourceMappingURL=postprocess.js.map