"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostProcess = void 0;
const path = require("path");
const child_process_1 = require("child_process");
const dvr_js_1 = require("../core/dvr.js");
const colors = require("colors");
const fsp = require("fs/promises");
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
        const namePrint = streamer ? `${colors.name(streamer.nm)}` : "";
        const fileType = this.config.recording.autoConvertType;
        const completeDir = await this.getCompleteDir(site, streamer);
        const completeFile = await this.uniqueFileName(completeDir, capInfo.filename, fileType) + "." + fileType;
        const capPath = path.join(this.config.recording.captureDirectory, capInfo.filename + ".ts");
        const cmpPath = path.join(completeDir, completeFile);
        if (fileType === "ts") {
            this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} moving ${capPath} to ${cmpPath}`);
            await this.mv(capPath, cmpPath);
            await this.postScript(site, streamer, completeDir, completeFile);
            return;
        }
        const script = this.dvr.calcPath(this.config.recording.postprocess);
        const args = [capPath, cmpPath, fileType];
        this.dvr.print(dvr_js_1.MSG.INFO, `${namePrint} converting recording to ${fileType}`, site);
        this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} ${colors.cmd(script)} ${colors.cmd(args.join(" "))}`, site);
        const myCompleteProcess = child_process_1.spawn(script, args);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, myCompleteProcess, true);
        }
        myCompleteProcess.on("close", () => {
            void new Promise(async () => {
                if (!this.config.recording.keepTsFile) {
                    try {
                        await fsp.access(args[0], fsp.F_OK);
                        await fsp.unlink(args[0]);
                    }
                    catch (error) {
                        this.dvr.print(dvr_js_1.MSG.ERROR, `${args[0]} does not exist, cannot remove`);
                    }
                }
                this.dvr.print(dvr_js_1.MSG.INFO, `${namePrint} done converting ${colors.file(completeFile)}`, site);
                await this.postScript(site, streamer, completeDir, completeFile);
            });
        });
        myCompleteProcess.on("error", (err) => {
            this.dvr.print(dvr_js_1.MSG.ERROR, err.toString());
        });
    }
    async postScript(site, streamer, completeDir, completeFile) {
        if (!this.config.postprocess) {
            await this.nextConvert(site, streamer);
            return;
        }
        const script = this.dvr.calcPath(this.config.postprocess);
        const args = [completeDir, completeFile];
        const namePrint = streamer === undefined ? "" : `${colors.name(streamer.nm)}`;
        this.dvr.print(dvr_js_1.MSG.DEBUG, `${namePrint} running global postprocess script: ` +
            `${colors.cmd(script)} ${colors.cmd(args.join(" "))}`, site);
        const userPostProcess = child_process_1.spawn(script, args);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, userPostProcess, true);
        }
        userPostProcess.on("close", () => {
            this.dvr.print(dvr_js_1.MSG.INFO, `${namePrint} done post-processing ${colors.file(completeFile)}`, site);
            void new Promise(async () => {
                await this.nextConvert(site, streamer);
            });
        });
    }
    async nextConvert(site, streamer) {
        if (site && streamer) {
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
    async uniqueFileName(completeDir, filename, fileType) {
        // If the output file already exists, make filename unique
        let count = 1;
        let fileinc = filename;
        let name = path.join(completeDir, fileinc + "." + fileType);
        try {
            while (await fsp.access(name, fsp.F_OK)) {
                this.dvr.print(dvr_js_1.MSG.ERROR, name + " already exists");
                fileinc = filename + " (" + count.toString() + ")";
                name = path.join(completeDir, fileinc + "." + fileType);
                count++;
            }
        }
        catch (err) {
        }
        return fileinc;
    }
    async mv(oldPath, newPath) {
        try {
            await fsp.rename(oldPath, newPath);
        }
        catch (err) {
            if (err) {
                if (err.code === "EXDEV") {
                    try {
                        await fsp.copyFile(oldPath, newPath);
                        await fsp.unlink(oldPath);
                    }
                    catch (err) {
                        if (err) {
                            this.dvr.print(dvr_js_1.MSG.ERROR, `${colors.site(oldPath)}: ${err.toString()}`);
                        }
                    }
                }
                else {
                    this.dvr.print(dvr_js_1.MSG.ERROR, `${colors.site(oldPath)}: ${err.toString()}`);
                }
            }
        }
    }
}
exports.PostProcess = PostProcess;
//# sourceMappingURL=postprocess.js.map