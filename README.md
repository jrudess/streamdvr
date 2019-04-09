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

* Supported sites: Twitch, Mixer, Youtube, Pixiv, Smashcast

* Docker available at https://hub.docker.com/r/purrsevere/streamdvr-docker/

### Setup ###

* Dependencies: `bash`, `node.js >= 10.13.0`, `npm`, `git`, and `ffmpeg`
  * StreamDVR does not work in a windows command prompt.  Use WSL to run StreamDVR in Windows.
* Optional Dependencies: `streamlink`, `youtube-dl`

  * Using `streamlink` requires an additional streamlink plugin at https://github.com/back-to/generic
  * `streamlink` is used to fetch m3u8 URLs for Pixiv, and Smashcast by default
  * `youtube-dl` is used to fetch m3u8 URLs for Twitch, Mixer, and Youtube by default

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to locally install all dependencies in package.json

### Instructions ###

Refer to `config/config.yml` for all configuration options.

* config files are loaded from the following paths (listed in precedence order):
  * $XDG_CONFIG_HOME/streamdvr/
  * $HOME/.config/streamdvr/
    * %LOCALAPPDATA%/streamdvr/ on windows
  * $cwd/config/

* To run: `streamdvr`
* To suppress node warnings: `NODE_NO_WARNINGS=1 streamdvr`

* TUI navigation:
    * `1` to focus the streamer list, `Esc` to unfocus
    * `2` to focus the site list, `Esc` to unfocus
    * `enter` to focus the input bar for CLI
    * `Up/Down/PgUp/PgDn` to scroll the active focus

* CLI:
```
    add     [site] [streamer]
    addtemp [site] [streamer]
    pause   [site] <streamer> <time in seconds>
    remove  [site] [streamer]
    reload
    help
```
* Custom Post Processing is enabled in `config.yml` with `postprocess: /path/to/script`
```bash
    #!/bin/bash
    #arg0 is path, arg1 is filename
    args=("$@")
    notify-send "streamdvr" "Done recording ${args[1]}"
```
* Adding new plugins

Every site that is supported by either streamlink or youtube-dl will work with StreamDVR.  All that is necessary is to create a new configuration file with the site's details.  Refer to any existing yml file in the config directory for an example.

* Adding new lookup utilities and recorders

All support for streaming sites is handled by 3rd party programs.  The site configuration yml files specify the m3u8 lookup and record scripts to use.   Adding support for new programs requires adding new wrapper scripts and using those scripts in the yml configuration file.
