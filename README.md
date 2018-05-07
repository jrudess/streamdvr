StreamDVR
==========

### About ###

StreamDVR records your favorite live streamers while you are away.  No need to miss a broadcast!

Time shifting is not a crime!
https://en.wikipedia.org/wiki/Sony_Corp._of_America_v._Universal_City_Studios,_Inc.

* Captures using either ffmpeg or streamlink to ts constainers

* Automatic post-processing converts recordings to mp4 or mkv containers.

* Supported sites: Twitch, Mixer, MyFreeCams, Chaturbate

Setup
==========

* Dependencies: `node.js >= 9.4.0`, `npm`, and `ffmpeg`
* Optional Dependencies: `git`, `streamlink`, `youtube-dl`

  * `git` is only needed to run 'npm install' and not to run streamdvr
  * `streamlink` can be used to capture as an alternative to ffmpeg
  * `youtube-dl` is only needed to record Twitch and Mixer

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to fetch all of the package dependences listed in package.json.

Instructions
===========

Refer to `config.yml` for all configuration options.

* To run: `node streamdvr.js`
* To run without color: `node streamdvr.js --no-color`

* TUI navigation:
    * 1 to focus the streamer list
    * Enter to focus the input bar, enter again to focus the log (if enabled)
    * Up/Down/PgUp/PgDn to scroll the active focus

Console Commands
===========
* add     [site] [streamer]
* addtemp [site] [streamer]
* remove  [site] [streamer]
* reload
* hide [log|list]
* show [log|list]
* help
