StreamDVR
==========

### About ###

StreamDVR records your favorite live streamers while you are away.  No need to miss a broadcast!

Time shifting is not a crime:
https://en.wikipedia.org/wiki/Sony_Corp._of_America_v._Universal_City_Studios,_Inc.

* Use either ffmpeg or streamlink to record to ts-containers

* Automatically convert recordings to mp4 or mkv

* Run custom post-process scripts after conversion to...
    * upload to cloud storage
    * generate thumbnail previews
    * do anything you want

* Supported sites: Twitch, Mixer, MyFreeCams, Chaturbate

Setup
==========

* Dependencies: `node.js >= 10.12.0`, `npm`, `git`, and `ffmpeg`
* Optional Dependencies: `streamlink, `youtube-dl`, `mfcauto`

  * `streamlink` can be used to record instead of ffmpeg with a streamlink plugin at https://github.com/back-to/generic
  * `youtube-dl` is used to fetch m3u8 URLs for CB, Twitch and Mixer
  * `mfcauto` is used to fetch m3u8 URLs for MyFreeCams

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to fetch all of the package dependences listed in package.json.

Instructions
===========

Refer to `config/config.yml` for all configuration options.

* config files are loaded from the following paths (listed in precedence order):
  * $XDG_CONFIG_HOME/streamdvr/
  * $HOME/.config/streamdvr/
    * %LOCALAPPDATA%/streamdvr/ on windows
  * $cwd/config/

* To run: `node streamdvr.js`
* To run without color: `node --no-color streamdvr.js`
* To suppress node warnings: `node --no-warnings streamdvr.js`

* TUI navigation:
    * `1` to focus the streamer list
    * `enter` to focus the input bar.  `enter` a second time to re-focus the log (if enabled)
    * `Up/Down/PgUp/PgDn` to scroll the active focus

* TUI Console Commands:
    * add     [site] [streamer]
    * addtemp [site] [streamer]
    * remove  [site] [streamer]
    * reload
    * hide [log|list]
    * show [log|list]
    * help

* Custom Post Processing is enabled in `config.yml` with `postprocess: /path/to/script`
```bash
    #!/usr/bin/bash
    #arg0 is path, arg1 is filename
    args=("$@")
    notify-send "streamdvr" "Done recording ${args[1]}"
```
