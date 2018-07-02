const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, config, siteDir, tui, siteUrl) {
        super(siteName, config, siteDir, tui, siteUrl, "youtube-dl -g ", "");
    }
}

exports.Youtubedl = Youtubedl;

