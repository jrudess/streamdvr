const {Streamlink} = require("../core/streamlink");

class Camsoda extends Streamlink {
    constructor(tui) {
        super("CAMSODA", tui, "best");
    }
}

exports.Plugin = Camsoda;

