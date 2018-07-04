const youtubedl = require("../core/youtubedl");

class Twitch extends youtubedl.Youtubedl {
    constructor(tui) {
        super("TWITCH", "_twitch", tui, "https://www.twitch.tv/", false);
    }
}

exports.Twitch = Twitch;

