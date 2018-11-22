const {Streamlink} = require("../core/streamlink");

class Camsoda extends Streamlink {
    constructor(tui) {
        super("CAMSODA", tui, false, "best");
    }
}

exports.Plugin = Camsoda;

