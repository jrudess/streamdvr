const {Streamlink} = require("../core/streamlink");

class Mfcsl extends Streamlink {
    constructor(name, tui) {
        super(name, tui, "best");
    }
}

exports.Plugin = Mfcsl;

