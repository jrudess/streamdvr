const basicsite = require("./basicsite");

class Streamlink extends basicsite.Basicsite {
    constructor(siteName, tui, cmdback) {
        super(siteName, tui, "streamlink --stream-url ", cmdback);
        this.siteType = "streamlink";
    }
}

exports.Streamlink = Streamlink;

