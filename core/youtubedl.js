const basicsite = require("./basicsite");

class Youtubedl extends basicsite.Basicsite {
    constructor(siteName, tui) {
        super(siteName, tui, "youtube-dl -g ", "");
        this.siteType = "youtubedl";
    }
}

exports.Youtubedl = Youtubedl;

