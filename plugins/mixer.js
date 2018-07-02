const youtubedl = require("../core/youtubedl");

class Mixer extends youtubedl.Youtubedl {
    constructor(config, tui) {
        super("MIXER", config, "_mixer", tui, "https://mixer.com/", false);
    }
}

exports.Mixer = Mixer;

