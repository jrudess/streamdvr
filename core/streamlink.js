const basicsite = require("./basicsite");

class Streamlink extends basicsite.Basicsite {
    constructor(siteName, config, siteDir, tui, siteUrl, noHLS) {
        super(siteName, config, siteDir, tui, siteUrl, noHLS, "streamlink --stream-url ", " best");
    }
}

exports.Streamlink = Streamlink;

