const streamlink = require("../core/streamlink");

class Fc2 extends streamlink.Streamlink {
    constructor(tui) {
        super("FC2", "_fc2", tui, "https://live.fc2.com/", true);
    }
}

exports.Fc2 = Fc2;

