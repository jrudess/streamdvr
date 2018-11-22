const {Youtubedl} = require("../core/youtubedl");

class Twitch extends Youtubedl {
    constructor(tui) {
        super("TWITCH", tui);
    }
}

exports.Plugin = Twitch;

