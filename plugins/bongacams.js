const streamlink = require("../core/streamlink");

class Bonga extends streamlink.Streamlink {
    constructor(tui) {
        super("BONGA", "_bonga", tui, "https://bongacams.com/", false);
    }
}

exports.Bonga = Bonga;

