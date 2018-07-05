const youtubedl = require("../core/youtubedl");

class Mixer extends youtubedl.Youtubedl {
    constructor(tui) {
        super("MIXER", "_mixer", tui, "https://mixer.com/", false, "best");
    }
}

exports.Mixer = Mixer;

