const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, tui, siteUrl, noHLS) {
        super(siteName, tui, siteUrl, noHLS, "youtube-dl -g ", "");
        this.siteType = "youtubedl";
    }
}

exports.Youtubedl = Youtubedl;

