const streamlink = require("../core/streamlink");

class Cb extends streamlink.Streamlink {
    constructor(tui) {
        super("CB", "_cb", tui, "https://chaturbate.com/", false);
    }
}

exports.Cb = Cb;

