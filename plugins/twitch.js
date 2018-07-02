const youtubedl    = require("../core/youtubedl");

class Twitch extends youtubedl.Youtubedl {
    constructor(config, tui) {
        super("TWITCH", config, "_twitch", tui, "https://www.twitch.tv/", false);
    }
}

exports.Twitch = Twitch;

