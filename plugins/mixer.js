const youtubedl = require("../core/youtubedl");

class Mixer extends youtubedl.Youtubedl {
    constructor(tui) {
        super("MIXER", tui, "https://mixer.com/", false, "best");
    }
}

exports.Plugin = Mixer;

