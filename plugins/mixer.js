const {Youtubedl} = require("../core/youtubedl");

class Mixer extends Youtubedl {
    constructor(tui) {
        super("MIXER", tui);
    }
}

exports.Plugin = Mixer;

