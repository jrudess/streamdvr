const streamlink = require("../core/streamlink");

class Camsoda extends streamlink.Streamlink {
    constructor(tui) {
        super("CAMSODA", tui, "https://www.camsoda.com/", false, "best");
    }
}

exports.Plugin = Camsoda;

