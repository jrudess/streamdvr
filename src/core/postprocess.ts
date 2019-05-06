"use strict";

import * as fs from "fs";
import {spawn} from "child_process";
import {Dvr, Config} from "../core/dvr.js";
import {Site, Streamer, CapInfo} from "../core/site.js";

const mv      = require("mv");
const colors  = require("colors");

export class PostProcess {

    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<any>;

    constructor(dvr: any) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }

    public async add(capInfo: CapInfo) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            await this.convert();
        }
    }

    protected async convert() {

        const capInfo: CapInfo          = this.postProcessQ[0];
        const site: Site | null         = capInfo.site;
        const streamer: Streamer | null = capInfo.streamer;
        const namePrint: string         = streamer === null ? "" : `${colors.name(streamer.nm)}` + " ";
        const capDir: string            = this.config.recording.captureDirectory + "/";
        const capFile: string           = capInfo.filename + ".ts";
        const fileType: string          = this.config.recording.autoConvertType;
        const completeDir: string       = await this.getCompleteDir(site, streamer) + "/";
        const uniqueName: string        = this.uniqueFileName(completeDir, capInfo.filename, fileType);
        const completeFile: string      = uniqueName + "." + fileType;

        if (fileType === "ts") {
            this.dvr.dbgMsg(namePrint + "recording moved " +
                capDir + capFile + " to " + completeDir + completeFile);
            mv(capDir + capFile, completeDir + completeFile, (err: Error) => {
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

        const myCompleteProcess = spawn(script, args);

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                fs.unlinkSync(args[0]);
            }

            this.dvr.infoMsg(namePrint + "done converting " + completeFile, site);
            this.postScript(site, streamer, completeDir, completeFile);
        });

        myCompleteProcess.on("error", (err: Error) => {
            this.dvr.errMsg(err.toString());
        });
    }

    protected async postScript(site: Site | null, streamer: any, completeDir: string, completeFile: string) {
        if (!this.config.postprocess) {
            await this.nextConvert(site, streamer);
            return;
        }

        const script    = this.dvr.calcPath(this.config.postprocess);
        const args      = [completeDir, completeFile];
        const namePrint = streamer === null ? "" : `${colors.name(streamer.nm)}` + " ";

        this.dvr.infoMsg(namePrint + "running global postprocess script: " + `${colors.cmd(script)}` +
            " " + `${colors.cmd(args.join(" "))}`, site);
        const userPostProcess = spawn(script, args);

        userPostProcess.on("close", () => {
            this.dvr.infoMsg(namePrint + "done post-processing " + `${colors.file(completeFile)}`, site);
            this.nextConvert(site, streamer);
        });
    }

    protected async nextConvert(site: Site | null, streamer: any) {

        if (site) {
            await site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            await this.convert();
        }
    }

    protected async getCompleteDir(site: Site | null, streamer: Streamer | null) {
        if (site && streamer) {
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
            fileinc = filename + " (" + count.toString() + ")";
            name = completeDir + fileinc + "." + fileType;
            count++;
        }
        return fileinc;
    }

}
