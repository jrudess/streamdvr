const {Streamlink} = require("../core/streamlink");

class Fc2 extends Streamlink {
    constructor(tui) {
        super("FC2", tui, true, "best");
    }
}

exports.Plugin = Fc2;

