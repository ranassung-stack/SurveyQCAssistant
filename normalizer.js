function normalizeQuestion(text) {

    let cleaned = text;

    //----------------------------------
    // Remove [Programming Instructions]
    //----------------------------------

    if (CONFIG.ignoreBracketInstructions) {

        cleaned = cleaned.replace(/\[.*?\]/gs, "");

    }

    //----------------------------------
    // Remove <1> <2>
    //----------------------------------

    if (CONFIG.ignoreAngleBracketCodes) {

        cleaned = cleaned.replace(/<\d+>/g, "");

    }

    //----------------------------------
    // Remove Question IDs
    //----------------------------------

    if (CONFIG.ignoreQuestionNumbers) {

        cleaned = cleaned.replace(
            /^\s*[A-Za-z]+\d[A-Za-z0-9_]*(?:[.\-]\d+)*(?:\.\s*|\s+)/gm,
            ""
        );

    }

    //----------------------------------
    // Remove response numbers
    //----------------------------------

    if (CONFIG.ignoreResponseCodes) {

        // (a) Leader followed by a TAB or a wide gap (2+ spaces) —
        //     the Word / questionnaire paste pattern:
        //     "1\tOther", "1    Other", "1.\tOther", "\u2022    Other", "a.  Other"
        cleaned = cleaned.replace(
            /^[ ]*(?:\(?\d+\)?[.)]?|\(?[A-Za-z]\)?[.)]?|\(?[ivxlcdmIVXLCDM]{1,6}\)?[.)]?|[\u2022\u25E6\u25AA\u2023\u00B7\-\u2013*])(?:(?:[ ]*\t[ ]*)+|[ ]{2,})/gm,
            ""
        );

        // (b) Number / letter / roman with a dot or paren separator:
        //     "1.", "1)", "(1)", "a.", "iv)"
        cleaned = cleaned.replace(
            /^[ ]*(?:\([0-9A-Za-z]+\)|\d+[.)]|[A-Za-z][.)]|[ivxlcdmIVXLCDM]{1,6}[.)])[ ]*/gm,
            ""
        );

        // (c) Bullet character followed by a space:
        //     "\u2022 Other", "- Other", "* Other"
        cleaned = cleaned.replace(
            /^[ ]*[\u2022\u25E6\u25AA\u2023\u00B7\-\u2013*][ ]+/gm,
            ""
        );

    }

    //----------------------------------
    // Collapse spaces
    //----------------------------------

    if (CONFIG.ignoreExtraWhitespace) {

        cleaned = cleaned.replace(/[ \t]+/g, " ");

    }

    //----------------------------------
    // Remove blank lines
    //----------------------------------

    if (CONFIG.ignoreBlankLines) {

        cleaned = cleaned.replace(/\n\s*\n/g, "\n");

    }

    //----------------------------------
    // Ignore Case
    //----------------------------------

    if (CONFIG.ignoreCase) {

        cleaned = cleaned.toLowerCase();

    }

    return cleaned.trim();

}