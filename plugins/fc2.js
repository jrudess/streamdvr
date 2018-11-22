const {Streamlink} = require("../core/streamlink");

class Fc2 extends Streamlink {
    constructor(name, tui) {
        super(name, tui, "best");
    }
}

exports.Plugin = Fc2;

