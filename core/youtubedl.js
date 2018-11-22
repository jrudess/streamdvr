const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, tui, noHLS) {
        super(siteName, tui, noHLS, "youtube-dl -g ", "");
        this.siteType = "youtubedl";
    }
}

exports.Youtubedl = Youtubedl;

