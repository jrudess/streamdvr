"use strict";

export {};
declare var require: any

const fs      = require("fs");
const mv      = require("mv");
const {spawn} = require("child_process");
const colors  = require("colors");

class PostProcess {

    dvr: any;
    config: any;
    postProcessQ: Array<any>;

    constructor(dvr : any) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }

    add(capInfo : any) {
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
            mv(capDir + capFile, completeDir + completeFile, (err : any) => {
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

        myCompleteProcess.on("error", (err : any) => {
            this.dvr.errMsg(err.toString());
        });
    }

    postScript(site : any, streamer : any, completeDir : string, completeFile : string) {
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
            return;
        }

        const script    = this.dvr.calcPath(this.config.postprocess);
        const args      = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : streamer.nm.name + " ";

        site.infoMsg(namePrint + "running global postprocess script: " +
            script.cmd + " " + colors.cmd(args.join(" ")));
        const userPostProcess = spawn(script, args);

        userPostProcess.on("close", () => {
            site.infoMsg(namePrint + "done post-processing " + colors.file(completeFile));
            this.nextConvert(site, streamer);
        });
    }

    nextConvert(site : any, streamer : any) {

        if (site !== this.dvr) {
            site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.convert();
        }
    }

    async getCompleteDir(site : any, streamer : any) {
        if (streamer) {
            const dir = await site.getCompleteDir(streamer);
            return dir;
        }

        return this.dvr.mkdir(this.config.recording.completeDirectory + "/UNKNOWN");
    }

    uniqueFileName(completeDir : string, filename : string, fileType : string) {
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
