const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, config, siteDir, tui, siteUrl, noHLS) {
        super(siteName, config, siteDir, tui, siteUrl, noHLS, "youtube-dl -g ", "");
    }
}

exports.Youtubedl = Youtubedl;

