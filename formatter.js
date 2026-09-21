function getFormattingIssues(expected, actual, component) {

    const issues = [];

    //----------------------------------
    // Multiple spaces
    //----------------------------------

    if (/ {2,}/.test(expected) !== / {2,}/.test(actual)) {

        issues.push({
            component,
            issue: "Formatting",
            expected: showSpaces(expected),
            found: showSpaces(actual),
            difference: "Multiple spaces detected"
        });

    }

    //----------------------------------
    // Leading spaces
    //----------------------------------

    if (/^\s/.test(expected) !== /^\s/.test(actual)) {

        issues.push({
            component,
            issue: "Formatting",
            expected: showSpaces(expected),
            found: showSpaces(actual),
            difference: "Leading space differs"
        });

    }

    //----------------------------------
    // Trailing spaces
    //----------------------------------

    if (/\s$/.test(expected) !== /\s$/.test(actual)) {

        issues.push({
            component,
            issue: "Formatting",
            expected: showSpaces(expected),
            found: showSpaces(actual),
            difference: "Trailing space differs"
        });

    }

    return issues;

}

function showSpaces(text){

    return text
        .replace(/ /g,"·")
        .replace(/\t/g,"→");

}