const {Streamlink} = require("../core/streamlink");

class Bonga extends Streamlink {
    constructor(tui) {
        super("BONGA", tui, "best");
    }
}

exports.Plugin = Bonga;

