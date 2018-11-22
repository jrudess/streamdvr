const {Youtubedl} = require("../core/youtubedl");

class Mixer extends Youtubedl {
    constructor(tui) {
        super("MIXER", tui, "https://mixer.com/", false, "best");
    }
}

exports.Plugin = Mixer;

