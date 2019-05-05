"use strict";

import * as fs from "fs";
import {spawn} from "child_process";
import {Dvr}   from "../core/dvr.js";
import {Site}  from "../core/site.js";

const mv      = require("mv");
const colors  = require("colors");

export class PostProcess {

    protected dvr: Dvr;
    protected config: any;
    protected postProcessQ: Array<any>;

    constructor(dvr: any) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }

    public async add(capInfo: any) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            await this.convert();
        }
    }

    protected async convert() {

        const capInfo              = this.postProcessQ[0];
        const site: Site           = capInfo.site;
        const streamer             = capInfo.streamer;
        const namePrint            = streamer === null ? "" : streamer.nm.name + " ";
        const capDir: string       = this.config.recording.captureDirectory + "/";
        const capFile: string      = capInfo.filename + ".ts";
        const fileType: string     = this.config.recording.autoConvertType;
        const completeDir: string  = await this.getCompleteDir(site, streamer) + "/";
        const uniqueName: string   = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        const completeFile: string = uniqueName + "." + fileType;

        if (fileType === "ts") {
            site.dbgMsg(namePrint + "recording moved " +
                capDir + capFile + " to " + completeDir + completeFile);
            mv(capDir + capFile, completeDir + completeFile, (err: any) => {
                if (err) {
                    this.dvr.errMsg(capInfo.filename.site + ": " + err.toString());
                }
            });

            await this.postScript(site, streamer, completeDir, completeFile);
            return;
        }

        const script = this.dvr.calcPath(this.config.recording.postprocess);
        const args = [
            capDir + capFile,
            completeDir + completeFile,
            fileType,
        ];

        if (site !== null) {
            site.infoMsg(namePrint + "converting to " + fileType + ": " +
                colors.cmd(script) + " " + colors.cmd(args.join(" ")));

            site.storeCapInfo(streamer, uniqueName, null, true);
        } else {
            this.dvr.infoMsg(namePrint + "converting to " + fileType + ": " +
                colors.cmd(script) + " " + colors.cmd(args.join(" ")));
        }

        const myCompleteProcess = spawn(script, args);

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(args[0]);
            }

            if (site !== null) {
                site.infoMsg(namePrint + "done converting " + completeFile);
            } else {
                this.dvr.infoMsg(namePrint + "done converting " + completeFile);
            }
            this.postScript(site, streamer, completeDir, completeFile);
        });

        myCompleteProcess.on("error", (err: any) => {
            this.dvr.errMsg(err.toString());
        });
    }

    protected async postScript(site: Site, streamer: any, completeDir: string, completeFile: string) {
        if (!this.config.postprocess) {
            await this.nextConvert(site, streamer);
            return;
        }

        const script    = this.dvr.calcPath(this.config.postprocess);
        const args      = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : streamer.nm.name + " ";

        if (site !== null) {
            site.infoMsg(namePrint + "running global postprocess script: " +
                colors.cmd(script) + " " + colors.cmd(args.join(" ")));
        } else {
            this.dvr.infoMsg(namePrint + "running global postprocess script: " +
                colors.cmd(script) + " " + colors.cmd(args.join(" ")));
        }
        const userPostProcess = spawn(script, args);

        userPostProcess.on("close", () => {
            if (site !== null) {
                site.infoMsg(namePrint + "done post-processing " + colors.file(completeFile));
            } else {
                this.dvr.infoMsg(namePrint + "done post-processing " + colors.file(completeFile));
            }
            this.nextConvert(site, streamer);
        });
    }

    protected async nextConvert(site: Site, streamer: any) {

        if (site !== null) {
            await site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            await this.convert();
        }
    }

    protected async getCompleteDir(site: Site, streamer: any) {
        if (streamer) {
            const dir = await site.getCompleteDir(streamer);
            return dir;
        }

        return this.dvr.mkdir(this.config.recording.completeDirectory + "/UNKNOWN");
    }

    protected uniqueFileName(completeDir: string, filename: string, fileType: string) {
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

