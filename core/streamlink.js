const basicsite = require("./basicsite");

class Streamlink extends basicsite.Basicsite {
    constructor(siteName, tui, noHLS, cmdback) {
        super(siteName, tui, noHLS, "streamlink --stream-url ", cmdback);
        this.siteType = "streamlink";
    }
}

exports.Streamlink = Streamlink;

