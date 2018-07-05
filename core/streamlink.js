const basicsite = require("./basicsite");

class Streamlink extends basicsite.Basicsite {
    constructor(siteName, siteDir, tui, siteUrl, noHLS, cmdback) {
        super(siteName, siteDir, tui, siteUrl, noHLS, "streamlink --stream-url ", cmdback);
    }
}

exports.Streamlink = Streamlink;

