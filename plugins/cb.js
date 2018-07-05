const streamlink = require("../core/streamlink");

class Cb extends streamlink.Streamlink {
    constructor(tui) {
        super("CB", tui, "https://chaturbate.com/", false, "best");
    }
}

exports.Cb = Cb;

