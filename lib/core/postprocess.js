"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const child_process_1 = require("child_process");
const mv = require("mv");
const colors = require("colors");
class PostProcess {
    constructor(dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }
    async add(capInfo) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            await this.convert();
        }
    }
    async convert() {
        const capInfo = this.postProcessQ[0];
        const site = capInfo.site;
        const streamer = capInfo.streamer;
        const namePrint = streamer === null ? "" : `${colors.name(streamer.nm)}` + " ";
        const capDir = this.config.recording.captureDirectory + "/";
        const capFile = capInfo.filename + ".ts";
        const fileType = this.config.recording.autoConvertType;
        const completeDir = await this.getCompleteDir(site, streamer) + "/";
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
            await this.postScript(site, streamer, completeDir, completeFile);
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
        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(args[0]);
            }
            this.dvr.infoMsg(namePrint + "done converting " + completeFile, site);
            this.postScript(site, streamer, completeDir, completeFile);
        });
        myCompleteProcess.on("error", (err) => {
            this.dvr.errMsg(err.toString());
        });
    }
    async postScript(site, streamer, completeDir, completeFile) {
        if (!this.config.postprocess) {
            await this.nextConvert(site, streamer);
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
    async nextConvert(site, streamer) {
        if (site) {
            await site.clearProcessing(streamer);
        }
        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            await this.convert();
        }
    }
    async getCompleteDir(site, streamer) {
        if (site && streamer) {
            const dir = await site.getCompleteDir(streamer);
            return dir;
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