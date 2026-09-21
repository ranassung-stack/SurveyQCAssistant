function getDifference(expected, actual) {

    expected = expected.trim();
    actual = actual.trim();

    if (expected === actual) {
        return "";
    }

    //--------------------------------------------------
    // Check for formatting issues first
    //--------------------------------------------------

    const formatting = detectFormattingIssues(expected, actual);

    if (formatting.length > 0) {
        return formatting.join("<br>");
    }

    //--------------------------------------------------
    // Word comparison
    //--------------------------------------------------

    const expectedWords = expected.split(/\s+/);
    const actualWords = actual.split(/\s+/);

    const added = [];
    const removed = [];

    actualWords.forEach(word => {
        if (!expectedWords.includes(word)) {
            added.push(word);
        }
    });

    expectedWords.forEach(word => {
        if (!actualWords.includes(word)) {
            removed.push(word);
        }
    });

    let result = [];

    if (added.length) {
        result.push("Added text: " + added.join(" "));
    }

    if (removed.length) {
        result.push("Missing text: " + removed.join(" "));
    }

    return result.join("<br>");

}


function detectFormattingIssues(expected, actual) {

    let issues = [];

    //---------------------------------------
    // Double / Triple spaces
    //---------------------------------------

    const expectedMulti = expected.match(/ {2,}/g);
    const actualMulti = actual.match(/ {2,}/g);

    if (JSON.stringify(expectedMulti) !== JSON.stringify(actualMulti)) {

        issues.push("<b>Formatting:</b> Multiple spaces detected");

    }

    //---------------------------------------
    // Leading spaces
    //---------------------------------------

    if (/^\s/.test(expected) !== /^\s/.test(actual)) {

        issues.push("<b>Formatting:</b> Leading space differs");

    }

    //---------------------------------------
    // Trailing spaces
    //---------------------------------------

    if (/\s$/.test(expected) !== /\s$/.test(actual)) {

        issues.push("<b>Formatting:</b> Trailing space differs");

    }

    return issues;

}

//--------------------------------------------------
// Highlight Differences
//--------------------------------------------------

function highlightDifference(expected, actual) {

    const expectedWords = expected.split(/\s+/);
    const actualWords = actual.split(/\s+/);

    const expectedSet = new Set(expectedWords);
    const actualSet = new Set(actualWords);

    const highlightedExpected = expectedWords.map(word => {

        if (!actualSet.has(word)) {

            return `<span class="qc-missing">${escapeHtml(word)}</span>`;

        }

        return escapeHtml(word);

    }).join(" ");

    const highlightedActual = actualWords.map(word => {

        if (!expectedSet.has(word)) {

            return `<span class="qc-added">${escapeHtml(word)}</span>`;

        }

        return escapeHtml(word);

    }).join(" ");

    return {

        expected: highlightedExpected,

        actual: highlightedActual

    };

}


//--------------------------------------------------
// Escape HTML
//--------------------------------------------------

function escapeHtml(text) {

    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}