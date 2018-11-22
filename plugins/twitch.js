const {Youtubedl} = require("../core/youtubedl");

class Twitch extends Youtubedl {
    constructor(tui) {
        super("TWITCH", tui, "https://www.twitch.tv/", false);
    }
}

exports.Plugin = Twitch;

