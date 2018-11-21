const youtubedl = require("../core/youtubedl");

class Cb extends youtubedl.Youtubedl {
    constructor(tui) {
        super("CB", tui, "https://chaturbate.com/", false);
    }
}

exports.Plugin = Cb;

