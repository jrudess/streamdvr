const streamlink = require("../core/streamlink");

class Cb extends streamlink.Streamlink {
    constructor(config, tui) {
        super("CB", config, "_cb", tui, "https://chaturbate.com/", false);
    }
}

exports.Cb = Cb;

