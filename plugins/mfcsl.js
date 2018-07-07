const streamlink = require("../core/streamlink");

class Mfcsl extends streamlink.Streamlink {
    constructor(tui) {
        super("MFCSL", tui, "https://www.myfreecams.com/#", false, "best");
    }
}

exports.Mfcsl = Mfcsl;

