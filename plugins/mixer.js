const {Youtubedl} = require("../core/youtubedl");

class Mixer extends Youtubedl {
    constructor(tui) {
        super("MIXER", tui, false, "best");
    }
}

exports.Plugin = Mixer;

