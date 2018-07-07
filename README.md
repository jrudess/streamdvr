StreamDVR
==========

### About ###

StreamDVR records your favorite live streamers while you are away.  No need to miss a broadcast!

Time shifting is not a crime:
https://en.wikipedia.org/wiki/Sony_Corp._of_America_v._Universal_City_Studios,_Inc.

* Captures using either ffmpeg or streamlink to ts containers

* Automatic post-processing converts recordings to mp4 or mkv containers.

* Supported sites: Twitch, Mixer, MyFreeCams, Chaturbate, Camsoda, Bongacams, Cam4

Setup
==========

* Dependencies: `node.js >= 10.0.0`, `npm`, `git`, and `ffmpeg`
* Optional Dependencies: `streamlink >= 0.14.1`, `youtube-dl`, `mfcauto`

  * `streamlink` is used to fetch m3u8 URLs or as an alternative recorder to ffmpeg
    * Needed for Chaturbate, Camsoda, Bongacams, and Cam4
    * To use streamlink as a recorder, the `hlssession` plugin is required: https://github.com/back-to/plugins/
  * `youtube-dl` is used to fetch m3u8 URLs for Twitch and Mixer
  * `mfcauto` is used to fetch m3u8 URLs for MyFreeCams

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to fetch all of the package dependences listed in package.json.

Instructions
===========

Refer to `config/config.yml` for all configuration options.

* config files are loaded from the following paths listed in precedence order
  * $XDG_CONFIG_HOME/streamdvr/
  * $HOME/.config/streamdvr/
    * %LOCALAPPDATA%/streamdvr/ on windows
  * $cwd/config/

* To run: `node streamdvr.js`
* To run without color: `node streamdvr.js --no-color`

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
