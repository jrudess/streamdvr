import * as fs from "https://deno.land/std@0.106.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.106.0/path/mod.ts";
import {spawn, ChildProcess} from "https://deno.land/std@0.106.0/node/child_process.ts";
import {rgb24} from "https://deno.land/std@0.106.0/fmt/colors.ts";
import {Dvr, Config, MSG} from "./dvr.ts";
import {Site, Streamer, CapInfo} from "./site.ts";

export class PostProcess {

    protected dvr: Dvr;
    protected config: Config;
    protected postProcessQ: CapInfo[];

    public constructor(dvr: Dvr) {
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

        const capInfo: CapInfo               = this.postProcessQ[0];
        const site: Site | undefined         = capInfo.site;
        const streamer: Streamer | undefined = capInfo.streamer;
        const namePrint: string              = streamer ? `${rgb24(streamer.nm, this.config.colors.name)}` : "";
        const fileType: string               = this.config.recording.autoConvertType;
        const completeDir: string            = await this.getCompleteDir(site, streamer);
        const completeFile: string           = await this.uniqueFileName(completeDir, capInfo.filename, fileType) + "." + fileType;
        const capPath: string                = path.join(this.config.recording.captureDirectory, capInfo.filename + ".ts");
        const cmpPath: string                = path.join(completeDir, completeFile);

        if (fileType === "ts") {
            this.dvr.print(MSG.DEBUG, `${namePrint} moving ${capPath} to ${cmpPath}`);
            await this.mv(capPath, cmpPath);
            await this.postScript(site, streamer, completeDir, completeFile);
            return;
        }

        const script: string = this.dvr.calcPath(this.config.recording.postprocess);
        const args: string[] = [ capPath, cmpPath, fileType ];

        this.dvr.print(MSG.INFO, `${namePrint} converting recording to ${fileType}`, site);
        this.dvr.print(MSG.DEBUG, `${namePrint} ${rgb24(script, this.config.colors.cmd)} ${rgb24(args.join(" "), this.config.colors.cmd)}`, site);

        const myCompleteProcess: ChildProcess = spawn(script, args);
        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, myCompleteProcess, true);
        }

        myCompleteProcess.on("close", () => {
            void new Promise<void>(async () => {
                if (!this.config.recording.keepTsFile) {
                    try {
                        await fs.exists(args[0]);
                        await Deno.remove(args[0]);
                    } catch (error: any) {
                        this.dvr.print(MSG.ERROR, `${args[0]} does not exist, cannot remove`);
                    }
                }

                this.dvr.print(MSG.INFO, `${namePrint} done converting ${rgb24(completeFile, this.config.colors.file)}`, site);
                await this.postScript(site, streamer, completeDir, completeFile);
            });
        });

        myCompleteProcess.on("error", (err: Error) => {
            this.dvr.print(MSG.ERROR, err.toString());
        });
    }

    protected async postScript(site: Site | undefined, streamer: Streamer | undefined, completeDir: string, completeFile: string) {
        if (!this.config.postprocess) {
            await this.nextConvert(site, streamer);
            return;
        }

        const script: string    = this.dvr.calcPath(this.config.postprocess);
        const args: string[]    = [completeDir, completeFile];
        const namePrint: string = streamer === undefined ? "" : `${rgb24(streamer.nm, this.config.colors.name)}`;

        this.dvr.print(MSG.DEBUG, `${namePrint} running global postprocess script: ` +
            `${rgb24(script, this.config.colors.cmd)} ${rgb24(args.join(" "), this.config.colors.cmd)}`, site);
        const userPostProcess: ChildProcess = spawn(script, args);

        if (site && streamer) {
            site.storeCapInfo(streamer, completeFile, userPostProcess, true);
        }

        userPostProcess.on("close", () => {
            this.dvr.print(MSG.INFO, `${namePrint} done post-processing ${rgb24(completeFile, this.config.colors.file)}`, site);
            void new Promise<void>(() => {
                this.nextConvert(site, streamer);
            });
        });
    }

    protected async nextConvert(site: Site | undefined, streamer: Streamer | undefined) {

        if (site && streamer) {
            await site.clearProcessing(streamer);
        }

        // Pop current job, and start next conversion job (if any)
        this.postProcessQ.shift();
        if (this.postProcessQ.length > 0) {
            await this.convert();
        }
    }

    protected async getCompleteDir(site: Site | undefined, streamer: Streamer | undefined): Promise<string> {
        if (site && streamer) {
            const dir: string = await site.getCompleteDir(streamer);
            return dir;
        }

        const dir = this.config.recording.completeDirectory + "/UNKNOWN";
        await fs.ensureDir(dir);
        return dir;
    }

    protected async uniqueFileName(completeDir: string, filename: string, fileType: string) {
        // If the output file already exists, make filename unique
        let count = 1;
        let fileinc = filename;
        let name = path.join(completeDir,  fileinc + "." + fileType);
        try {
            while (await fs.exists(name)) {
                this.dvr.print(MSG.ERROR, name + " already exists");
                fileinc = filename + " (" + count.toString() + ")";
                name = path.join(completeDir, fileinc + "." + fileType);
                count++;
            }
        } catch (_err: any) {
        }
        return fileinc;
    }

    protected async mv(oldPath: string, newPath: string) {

        try {
            await fs.move(oldPath, newPath);
        } catch (err: any) {
            if (err) {
                if (err.code === "EXDEV") {
                    try {
                        await fs.copy(oldPath, newPath);
                        await Deno.remove(oldPath);
                    } catch (err: any) {
                        if (err) {
                            this.dvr.print(MSG.ERROR, `${rgb24(oldPath, this.config.colors.site)}: ${err.toString()}`);
                        }
                    }
                } else {
                    this.dvr.print(MSG.ERROR, `${rgb24(oldPath, this.config.colors.site)}: ${err.toString()}`);
                }
            }
        }
    }

}
