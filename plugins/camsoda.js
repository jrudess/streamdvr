const {Streamlink} = require("../core/streamlink");

class Camsoda extends Streamlink {
    constructor(tui) {
        super("CAMSODA", tui, "https://www.camsoda.com/", false, "best");
    }
}

exports.Plugin = Camsoda;

