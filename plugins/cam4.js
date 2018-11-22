const {Streamlink} = require("../core/streamlink");

class Cam4 extends Streamlink {
    constructor(tui) {
        super("CAM4", tui, "best");
    }
}

exports.Plugin = Cam4;

