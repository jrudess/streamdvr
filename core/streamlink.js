const basicsite = require("./basicsite");

class Streamlink extends basicsite.Basicsite {
    constructor(siteName, config, siteDir, tui, siteUrl) {
        super(siteName, config, siteDir, tui, siteUrl, "streamlink --stream-url ", " best");
    }
}

exports.Streamlink = Streamlink;

