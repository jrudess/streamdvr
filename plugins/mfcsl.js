const {Streamlink} = require("../core/streamlink");

class Mfcsl extends Streamlink {
    constructor(tui) {
        super("MFCSL", tui, "best");
    }
}

exports.Plugin = Mfcsl;

