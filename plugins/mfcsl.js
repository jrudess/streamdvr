const {Streamlink} = require("../core/streamlink");

class Mfcsl extends Streamlink {
    constructor(tui) {
        super("MFCSL", tui, "https://www.myfreecams.com/#", false, "best");
    }
}

exports.Plugin = Mfcsl;

