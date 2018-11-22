const {Streamlink} = require("../core/streamlink");

class Cam4 extends Streamlink {
    constructor(name, tui) {
        super(name, tui, "best");
    }
}

exports.Plugin = Cam4;

