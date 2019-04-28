"use strict";

const fs      = require("fs");
const mv      = require("mv");
const {spawn} = require("child_process");

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

    async convert() {

        const capInfo      = this.postProcessQ[0];
        const site         = capInfo.site === null ? this.dvr : capInfo.site;
        const streamer     = capInfo.streamer;
        const namePrint    = streamer === null ? "" : streamer.nm.name + " ";
        const capDir       = this.config.recording.captureDirectory + "/";
        const capFile      = capInfo.filename + ".ts";
        const fileType     = this.config.recording.autoConvertType;
        const completeDir  = await this.getCompleteDir(site, streamer) + "/";
        const uniqueName   = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        const completeFile = uniqueName + "." + fileType;

        if (fileType === "ts") {
            site.dbgMsg(namePrint + "recording moved " +
                capDir + capFile + " to " + completeDir + completeFile);
            mv(capDir + capFile, completeDir + completeFile, (err) => {
                if (err) {
                    this.dvr.errMsg(capInfo.filename.site + ": " + err.toString());
                }
            });

            this.postScript(site, streamer, completeDir, completeFile);
            return;
        }

        const script = this.dvr.calcPath(this.config.recording.postprocess);
        const args = [
            capDir + capFile,
            completeDir + completeFile,
            fileType
        ];

        site.infoMsg(namePrint + "converting to " + fileType + ": " +
            script.cmd + " " + args.join(" ").cmd);

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
    }

    postScript(site, streamer, completeDir, completeFile) {
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
            return;
        }

        const script    = this.dvr.calcPath(this.config.postprocess);
        const args      = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : streamer.nm.name + " ";

        site.infoMsg(namePrint + "running global postprocess script: " +
            script.cmd + " " + args.join(" ").cmd);
        const userPostProcess = spawn(script, args);

        userPostProcess.on("close", () => {
            site.infoMsg(namePrint + "done post-processing " + completeFile.file);
            this.nextConvert(site, streamer);
        });
    }

    nextConvert(site, streamer) {

        if (site !== this.dvr) {
            site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.convert();
        }
    }

    async getCompleteDir(site, streamer) {
        if (streamer) {
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
            fileinc = filename + " (" + count + ")";
            name = completeDir + fileinc + "." + fileType;
            count++;
        }
        return fileinc;
    }

}

exports.PostProcess = PostProcess;
