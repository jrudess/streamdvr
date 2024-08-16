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

* Supported sites out of the box: Twitch, Youtube, Pixiv, Picarto

* See `Adding new plugins` to use StreamDVR with other sites that are supported by yt-dlp or streamlink.

* Docker available at https://ghcr.io/purrsevere/streamdvr

### Setup ###

* Dependencies: `bash`, `node.js >= 14.0.0`, `npm`, `git`, and `ffmpeg`
  * StreamDVR does not work in a windows command prompt.  Use WSL to run StreamDVR in Windows.
* Optional Dependencies: `streamlink`, `yt-dlp`

  * `streamlink` is used to fetch m3u8 URLs for Pixiv and Picarto by default
  * `yt-dlp` is used to fetch m3u8 URLs for Twitch and Youtube by default

* Install StreamDVR
  >On GitHub, click `Clone or download`, `Download ZIP`.
  >Or run `git clone https://github.com/jrudess/streamdvr.git`

* Run `npm install` to locally install all dependencies in package.json

### Instructions ###

* config files are loaded from the following paths (listed in precedence order):
  * $XDG_CONFIG_HOME/streamdvr/
  * $HOME/.config/streamdvr/
  * $cwd/config/

* To run: `streamdvr`

* Filename formatting:
  * `%s` Site Name
  * `%n` Streamer Name
  * `%d` Date and Time

* TUI navigation:
  * `1` to focus the streamer list, `Esc` to unfocus
  * `2` to focus the site list, `Esc` to unfocus
  * `enter` to focus the input bar for CLI
  * `Up/Down/PgUp/PgDn` to scroll the active focus

* CLI:
```
    add     [site] [streamer] <alias>
    addtemp [site] [streamer]
    pause   [site] <streamer> <time in seconds>
    remove  [site] [streamer]
    reload
    help
```
* Streamer aliases

Some websites, such as youtube, will have channel names that are random characters.  For example, the URL to capture NBC News live streams is https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg.  An alias can be specified when adding the channel to give it a better name.
```
    add youtube UCeY0bbntWzzVIaj2z3QigXg nbc_news
````
* Custom Post Processing is enabled in `config.yml` with `postprocess: /path/to/script`
```bash
    #!/bin/bash
    #arg0 is path, arg1 is filename
    args=("$@")
    notify-send "streamdvr" "Done recording ${args[1]}"
```
* Adding new plugins

Every site that is supported by either streamlink or yt-dlp will work with StreamDVR.  All that is necessary is to create a new configuration file with the site's details.  Refer to any existing yml file in the config directory for an example.

If you have created a <site>.yml for StreamDVR and would like to share it, please submit a pull request to include the new yml files in the repo.

All support for streaming sites is handled by 3rd party programs.  The site configuration yml files specify the m3u8 lookup and record scripts to use.   Adding support for new programs requires adding new wrapper scripts and using those scripts in the yml configuration file.

If you would like StreamDVR to support a new program and have written your own wrapper scripts, pull requests are welcome.  If you're just aware of other programs similar to yt-dlp or streamlink, please open an issue and provide the program's name/info.  If the program looks promising (e.g. works for at least one of the existing sites), then I'll probably add support for it.

* Configuration Options for `config.yml`

    * `enable`
        * `daemon`
          Suppresses standard out messages
    * `recording`
        * `autoConvertType`
          mp4, mkv, ts (no conversion)
        * `captureDirectory`
          Temporary storage area while recording
        * `completeDirectory`
          Final area to store recordings
        * `postprocess`
          Script to use to convert ts to mp4/mkv
        * `dateFormat`
          Used for log output and filenames
        * `includeSiteInDir`
          This option only applies if `streamerSubdir` is set.
          Recordings are placed in `completeDir/streamer_site`.
          If `siteSubdir` is set then `completeDir/site/streamer_site`.
        * `streamerSubdir`
          Recordings are placed in `completeDir/streamer/`
          If `includeSiteInDir` is set then `completeDir/streamer_site/`.
          If `siteSubdir` is set then `completeDir/site/{streamer, streamer_site}`.
        * `siteSubdir`
          Recordings are placed in `completeDir/site/`.
          If `streamerSubdir` is set then `completeDir/site/streamer/`.
        * `keepTsFile`
          This option leaves the ts file in captureDir after an
          mp4/mkv is converted.  This is mostly a 'debug' option.
        * `minSize`
          Minimum size in megabytes for a recording.
          Recordings smaller than this size are automatically deleted.
        * `maxSize`
          Maximum size in megabytes for a recording.
          Recordings that are larger than this size are halted and
          converted, then restarted.
    * `postprocess`
      Path to custom post-processing script that is run after
      a recording has been converted to its final file format.
      Arguments to script: arg0=path arg1=filename
    * `log`
        * `enable`
          Store log output to streamdvr.log
        * `append`
          Append new output to the file when true.
          Overwrite new output to the file when false.
    * `tui`
        * `enable`
          Allow interactive control of streamdvr with a text interface
        * `allowUnicode`
          Disable use of any fancy unicode characters in TUI output
    * `colors`
       Allows customization of various colors used in logs or TUI
    * `proxy`
        * `enable`
          Turns on socks5 proxy forwarding for m3u8_streamlink.sh and record_streamlink.sh
        * `server`
          socks5://127.0.0.1:9999
    * `debug`
        * `log`
          Enables debug messages to print in the normal log
        * `recorder`
          Store the ffmpeg/streamlink logs to a file when recording
        * `errortrace`
          Include a stack-trace for each error message

### TUI Screenshot ###

![img](https://github.com/jrudess/streamdvr/blob/master/tui.png)
