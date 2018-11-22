const {Youtubedl} = require("../core/youtubedl");

class Cb extends Youtubedl {
    constructor(tui) {
        super("CB", tui);
    }
}

exports.Plugin = Cb;

