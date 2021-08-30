//"use strict";

// require("events").EventEmitter.prototype._maxListeners = 100;

// import * as fs from "https://deno.land/std/fs/mod.ts";
import * as path from "https://deno.land/std/path/mod.ts";
import * as yaml from "https://deno.land/std/encoding/yaml.ts";
import {onSignal} from "https://deno.land/std/signal/mod.ts";
import * as log from "https://deno.land/std/log/mod.ts";
import * as Dvr from "./src/core/dvr.ts";
import {SiteConfig} from "./src/core/site.ts";
import * as Plugin from "./src/plugins/basic.ts";

class Streamdvr extends Dvr.Dvr {

    public plugins: SiteConfig[];

    public constructor() {
        super(path.dirname(path.fromFileUrl(import.meta.url)));
        this.plugins = [];

        // Scan the config.yml directory for plugins to load
        const allfiles: string[] = [];
        if (this.configdir !== undefined) {
            for (const dirEntry of Deno.readDirSync(this.configdir)) {
                if (dirEntry.isFile) {
                    allfiles.push(dirEntry.name);
                }
            }
        } else {
           Deno.exit(1);
        }
        // const allfiles = fs.readdirSync(super.configdir);
        const ymlfiles = allfiles.filter((x: string) => x.match(/.*\.yml$/ig) && !x.match(/.*_updates\.yml/ig) && x !== "config.yml");

        for (let i = 0; i < ymlfiles.length; i++) {
            if (this.configdir !== undefined) {
                const siteconfig: string = path.join(this.configdir, ymlfiles[i]);
                const config: SiteConfig = yaml.parse(Deno.readTextFileSync(siteconfig)) as SiteConfig;
                if (config && config.plugin) {
                    this.plugins.push(config);
                }
            }
        }

        for (const plugin of this.plugins.values()) {
            plugin.handle = new Plugin.Basic(plugin.name, this, /*this.tui,*/ plugin.urlback);
        }

        onSignal(Deno.Signal.SIGINT, () => {
            this.exit();
        });

    }

    public async start() {
        if (this.config.log.enable) {
            // TODO:
            // const {Console} = require("console");
            // const attr: string = this.config.log.append ? "a" : "w";
            // const logFile: fs.WriteStream = fs.createWriteStream("./streamdvr.log", {flags: attr});
            // var obj: Record<string,any> = {}
            await log.setup({
                handlers: {
                    console: new log.handlers.ConsoleHandler("DEBUG", {
                        formatter: "{datetime} [{levelName}] {msg}"
                    }),
                    file: new log.handlers.FileHandler("DEBUG", {
                        filename: "./streamdvr.log",
                        formatter: "{datetime} [{levelName}] {msg}",
                        mode: this.config.log.append ? "a" : "w"
                    })
                },
                loggers: {
                    default: {
                        level: this.config.debug.log ? "DEBUG" : "INFO",
                        handlers: ["console", "file"],
                    },
                }
            });
        }

        this.logger = log.getLogger();

        await super.start();
        for (const plugin of this.plugins.values()) {
            if (plugin.enable && plugin.handle !== undefined) {
                this.run(plugin.handle);
            }
        }
    }

    public busy() {
        for (const plugin of this.plugins.values()) {
            if (plugin.enable && plugin.handle !== undefined && plugin.handle.getNumCapsInProgress() > 0) {
                return true;
            }
        }
        return false;
    }

    public async tryExit() {
        while (true) {
            // delay exiting until all capture and postprocess
            // ffmpeg jobs have completed.
            if (!this.busy()) {
                for (const plugin of this.plugins.values()) {
                    if (plugin.enable && plugin.handle !== undefined) {
                        await plugin.handle.disconnect();
                    }
                }
                Deno.exit(0);
            } else {
                await this.sleep(1000);
            }
        }
    }

    public exit() {
        // Prevent bad things from happening if user holds down ctrl+c
        if (!this.tryingToExit) {
            this.tryingToExit = true;
            if (this.busy()) {
                this.print(Dvr.MSG.INFO, "Stopping all recordings...");
            }
            this.tryExit();
        }

        // Always pass SIGINT to the recorder
        for (const plugin of this.plugins.values()) {
            if (plugin.enable && plugin.handle !== undefined) {
                plugin.handle.haltAllCaptures();
            }
        }
    }

}

const dvr = new Streamdvr();
dvr.start();
