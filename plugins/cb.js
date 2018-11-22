const {Youtubedl} = require("../core/youtubedl");

class Cb extends Youtubedl {
    constructor(tui) {
        super("CB", tui, "https://chaturbate.com/", false);
    }
}

exports.Plugin = Cb;

