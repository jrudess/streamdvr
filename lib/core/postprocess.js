"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const mv = require("mv");
const path = require("path");
const child_process_1 = require("child_process");
const dvr_js_1 = require("../core/dvr.js");
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
        const namePrint = streamer ? `${colors.name(streamer.nm)}` : "";
        const fileType = this.config.recording.autoConvertType;
        const completeDir = this.getCompleteDir(site, streamer);
        const uniqueName = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        const completeFile = uniqueName + "." + fileType;
        const capPath = path.join(this.config.recording.captureDirectory, capInfo.filename + ".ts");
        const cmpPath = path.join(completeDir, completeFile);
        if (fileType === "ts") {
            this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} recording moved ${capPath} to ${cmpPath}`);
            mv(capPath, cmpPath, (err) => {
                if (err) {
                    this.dvr.print(dvr_js_1.MSG.ERROR, `${colors.site(capInfo.filename)}: ${err.toString()}`);
                }
            });
            this.postScript(site, streamer, completeDir, completeFile);
            return;
        }
        const script = this.dvr.calcPath(this.config.recording.postprocess);
        const args = [capPath, cmpPath, fileType];
        const myCompleteProcess = child_process_1.spawn(script, args);
        this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} converting to ${fileType}: ` +
            `${colors.cmd(script)} ${colors.cmd(args.join(" "))}`, site);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, myCompleteProcess, true);
        }
        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                if (fs.existsSync(args[0])) {
                    fs.unlinkSync(args[0]);
                }
                else {
                    this.dvr.print(dvr_js_1.MSG.ERROR, `${args[0]} does not exist, cannot remove`);
                }
            }
            this.dvr.print(dvr_js_1.MSG.INFO, `${namePrint} done converting ${completeFile}`, site);
            this.postScript(site, streamer, completeDir, completeFile);
        });
        myCompleteProcess.on("error", (err) => {
            this.dvr.print(dvr_js_1.MSG.ERROR, err.toString());
        });
    }
    postScript(site, streamer, completeDir, completeFile) {
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
            return;
        }
        const script = this.dvr.calcPath(this.config.postprocess);
        const args = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : `${colors.name(streamer.nm)}`;
        this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} running global postprocess script: ` +
            `${colors.cmd(script)} ${colors.cmd(args.join(" "))}`, site);
        const userPostProcess = child_process_1.spawn(script, args);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, userPostProcess, true);
        }
        userPostProcess.on("close", () => {
            this.dvr.print(dvr_js_1.MSG.INFO, `${namePrint} done post-processing ${colors.file(completeFile)}`, site);
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
        let name = path.join(completeDir, fileinc + "." + fileType);
        while (fs.existsSync(name)) {
            this.dvr.print(dvr_js_1.MSG.ERROR, name + " already exists");
            fileinc = filename + " (" + count.toString() + ")";
            name = path.join(completeDir, fileinc + "." + fileType);
            count++;
        }
        return fileinc;
    }
}
exports.PostProcess = PostProcess;
//# sourceMappingURL=postprocess.js.map