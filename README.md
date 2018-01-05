StreamDVR
==========

### About ###

StreamDVR allows you to record your favorite live streamers while you are away.  No need to miss a broadcast!

* Records using ffmpeg with ts containers.

* Automatic post-processing converts recordings to mp4 or mkv containers.

* Recordings are stored in either a flat or hierarchical structure.

* Supported sites: Twitch, MyFreeCams, Chaturbate

Setup
==========

* Dependencies: `node.js >= 7.0`, `npm`, `git`, `youtube-dl` and `ffmpeg`

  * `git` is only needed to run 'npm install' and not to run mfc_cb.node
  * `youtube-dl` is only needed to record twitch

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to fetch all of the package dependences listed in package.json.

Instructions
===========

Refer to `config.yml`.

* Streamers can be added or removed by adding them to the appropriate include section of `updates.yml`.  This file will get processed based on the `scanInterval` setting in `config.yml`.  Any listed streamers will be added or removed from `config.yml`. Because `config.yml` gets rewritten during this process, any manual edits made to this file while StreamDVR is running will get lost.  Streamers should only be added or removed by using `updates.yml`.

* For some sites, streamers are stored in `config.yml` using an ID number supplied by the site.  This allows StreamDVR to track the streamer even if they change their name.

* To run: `node streamdvr.js`
* To run without color: `node streamdvr.js --no-color`

* TUI navigation:
    * Numbers 1-4 to focus an active site-list
    * Enter to focus the input bar, enter again to focus the log if enabled
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
