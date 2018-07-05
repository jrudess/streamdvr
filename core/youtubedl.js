const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, siteDir, tui, siteUrl, noHLS) {
        super(siteName, siteDir, tui, siteUrl, noHLS, "youtube-dl -g ", "");
    }
}

exports.Youtubedl = Youtubedl;

