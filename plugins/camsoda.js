const {Streamlink} = require("../core/streamlink");

class Camsoda extends Streamlink {
    constructor(name, tui) {
        super(name, tui, "best");
    }
}

exports.Plugin = Camsoda;

