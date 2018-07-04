const streamlink = require("../core/streamlink");

class Camsoda extends streamlink.Streamlink {
    constructor(tui) {
        super("CAMSODA", "_camsoda", tui, "https://www.camsoda.com/", false);
    }
}

exports.Camsoda = Camsoda;

