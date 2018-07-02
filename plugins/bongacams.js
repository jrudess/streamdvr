const streamlink = require("../core/streamlink");

class Bonga extends streamlink.Streamlink {
    constructor(config, tui) {
        super("BONGA", config, "_bonga", tui, "https://bongacams.com/", false);
    }
}

exports.Bonga = Bonga;

