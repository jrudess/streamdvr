const youtubedl = require("../core/youtubedl");

class Twitch extends youtubedl.Youtubedl {
    constructor(tui) {
        super("TWITCH", tui, "https://www.twitch.tv/", false, "best");
    }
}

exports.Twitch = Twitch;

