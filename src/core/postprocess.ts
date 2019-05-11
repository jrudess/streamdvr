"use strict";

import * as fs from "fs";
import * as mv from "mv";
import {spawn} from "child_process";
import {Dvr, Config} from "../core/dvr.js";
import {Site, Streamer, CapInfo} from "../core/site.js";

const colors = require("colors");

export class PostProcess {

    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: Array<CapInfo>;

    constructor(dvr: Dvr) {
        this.dvr = dvr;
        this.config = dvr.config;
        this.postProcessQ = [];
    }

    public add(capInfo: CapInfo) {
        this.postProcessQ.push(capInfo);
        if (this.postProcessQ.length === 1) {
            this.convert();
        }
    }

    protected convert() {

        const capInfo: CapInfo          = this.postProcessQ[0];
        const site: Site | null         = capInfo.site;
        const streamer: Streamer | null = capInfo.streamer;
        const namePrint: string         = streamer ? `${colors.name(streamer.nm)}` + " " : "";
        const capDir: string            = this.config.recording.captureDirectory + "/";
        const capFile: string           = capInfo.filename + ".ts";
        const fileType: string          = this.config.recording.autoConvertType;
        const completeDir: string       = this.getCompleteDir(site, streamer) + "/";
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

        const myCompleteProcess = spawn(script, args);
        if (streamer)  {
            streamer.capture = myCompleteProcess;
        }

        myCompleteProcess.on("close", () => {
            if (!this.config.recording.keepTsFile) {
                if (fs.existsSync(args[0])) {
                    fs.unlinkSync(args[0]);
                } else {
                    this.dvr.errMsg(args[0] + "does not exist, cannot remove");
                }
            }

            this.dvr.infoMsg(namePrint + "done converting " + completeFile, site);
            this.postScript(site, streamer, completeDir, completeFile);
        });

        myCompleteProcess.on("error", (err: Error) => {
            this.dvr.errMsg(err.toString());
        });
    }

    protected postScript(site: Site | null, streamer: Streamer | null, completeDir: string, completeFile: string) {
        if (!this.config.postprocess) {
            this.nextConvert(site, streamer);
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

    protected nextConvert(site: Site | null, streamer: Streamer | null) {

        if (site && streamer) {
            site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            this.convert();
        }
    }

    protected getCompleteDir(site: Site | null, streamer: Streamer | null) {
        if (site && streamer) {
            return site.getCompleteDir(streamer);
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
