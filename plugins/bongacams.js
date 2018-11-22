const {Streamlink} = require("../core/streamlink");

class Bonga extends Streamlink {
    constructor(name, tui) {
        super(name, tui, "best");
    }
}

exports.Plugin = Bonga;

