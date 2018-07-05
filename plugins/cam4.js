const streamlink = require("../core/streamlink");

class Cam4 extends streamlink.Streamlink {
    constructor(tui) {
        super("CAM4", "_cam4", tui, "https://www.cam4.com/", true, "best");
    }
}

exports.Cam4 = Cam4;

