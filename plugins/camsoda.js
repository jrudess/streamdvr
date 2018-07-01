const streamlink = require("../core/streamlink");

class Camsoda extends streamlink.Streamlink {
    constructor(config, tui) {
        super("CAMSODA", config, "_camsoda", tui, "https://www.camsoda.com/");
    }
}

exports.Camsoda = Camsoda;

