// Node fallbacks so the pure logic is testable outside the browser.
// In the extension these are already globals (matcher.js / normalizer.js
// load before comparer.js), so the requires never run.
if (typeof matchResponses === "undefined" && typeof require !== "undefined") {
    var matchResponses = require("./matcher.js").matchResponses;
}


function compareSurvey(expectedText, actualText) {

    const expectedLines = splitLines(expectedText);
    const actualLines = splitLines(actualText);

    const comparison = {
        question: {
            expected: expectedLines.shift() || "",
            actual: actualLines.shift() || "",
            match: false
        },
        responses: { modified: [], missing: [], extra: [] }
    };

    comparison.question.match =
        comparison.question.expected === comparison.question.actual;

    compareResponses(expectedLines, actualLines, comparison.responses);

    return comparison;

}


function splitLines(text) {
    return text
        .split("\n")
        .map(x => x.trim())
        .filter(x => x.length > 0);
}


function compareResponses(expected, actual, result) {
    const matched = matchResponses(expected, actual);
    result.modified = matched.modified;
    result.missing = matched.missing;
    result.extra = matched.extra;
}


//--------------------------------------------------
// Grid: parse the expected spec
//
// Reads the [ROWS] / [COLUMNS] structure from the RAW spec
// BEFORE the normalizer strips bracket instructions, then
// normalizes each row/column line individually. Returns
// null when there is no [COLUMNS] section (i.e. not a grid).
//--------------------------------------------------

function parseExpectedGrid(rawText) {

    const rawLines = String(rawText).split("\n");

    const rowsIdx = rawLines.findIndex(l => /\[\s*rows?\b/i.test(l));
    const colsIdx = rawLines.findIndex(l => /\[\s*columns?\b/i.test(l));

    if (colsIdx === -1) return null;   // no columns => not a grid spec

    // Question = first line that survives normalization
    let question = "";
    let questionIdx = -1;
    for (let i = 0; i < rawLines.length; i++) {
        const norm = normalizeQuestion(rawLines[i]);
        if (norm) { question = norm; questionIdx = i; break; }
    }

    const rowStart = rowsIdx !== -1 ? rowsIdx + 1 : questionIdx + 1;

    const cleanBlock = (arr) => arr
        .map(l => normalizeQuestion(l))
        .filter(Boolean)
        .filter(l => l !== question)
        .filter(l => !/^\s*(rows?|columns?)\b/i.test(l));

    const rows = cleanBlock(rawLines.slice(rowStart, colsIdx));
    const columns = cleanBlock(rawLines.slice(colsIdx + 1));

    return { question, rows, columns };

}


//--------------------------------------------------
// Grid: compare expected vs actual
//
// Rows and columns are matched independently with the same
// order-independent engine used for flat responses. Missing
// cells are the rectangular-completeness gaps found on the
// live page.
//--------------------------------------------------

function compareGrid(expectedGrid, actualGrid) {

    return {
        question: {
            expected: expectedGrid.question,
            actual: actualGrid.question,
            match: expectedGrid.question === actualGrid.question
        },
        rows: matchResponses(expectedGrid.rows, actualGrid.rows),
        columns: matchResponses(expectedGrid.columns, actualGrid.columns),
        cells: { missing: actualGrid.missingCells || [] }
    };

}


//--------------------------------------------------
// Ranking: read the rank limit
//
// Prefers an explicit bracket override ([RANK 4] / [MAXRANK: 4]);
// otherwise pulls the number from wording like "up to 4" /
// "select 4". Returns null when no limit can be found.
//--------------------------------------------------

function parseRankLimit(rawText, questionText) {

    const brace = String(rawText).match(/\[\s*(?:max\s*)?rank[^\]]*?(\d+)\s*\]/i);
    if (brace) return parseInt(brace[1], 10);

    const m = String(questionText).match(/\b(?:up to|select|rank|choose|pick)\s+(\d+)\b/i);
    if (m) return parseInt(m[1], 10);

    return null;

}


//--------------------------------------------------
// Ranking: parse the expected spec
//
// Flat response list; lines tagged [EXCLUSIVE] in the RAW
// text become exclusive options, the rest are rankable items.
//--------------------------------------------------

function parseExpectedRanking(rawText) {

    const rawLines = String(rawText).split("\n");

    let question = "";
    let questionIdx = -1;
    for (let i = 0; i < rawLines.length; i++) {
        const norm = normalizeQuestion(rawLines[i]);
        if (norm) { question = norm; questionIdx = i; break; }
    }

    const items = [];
    const exclusive = [];

    rawLines.forEach((line, i) => {
        if (i === questionIdx) return;
        const norm = normalizeQuestion(line);
        if (!norm || norm === question) return;
        if (/\[[^\]]*\bexclusive\b[^\]]*\]/i.test(line)) exclusive.push(norm);
        else items.push(norm);
    });

    return {
        question,
        items,
        exclusive,
        rankLimit: parseRankLimit(rawText, question)
    };

}


//--------------------------------------------------
// Ranking: compare expected vs actual
//--------------------------------------------------

function compareRanking(expected, actual) {

    return {
        question: {
            expected: expected.question,
            actual: actual.question,
            match: expected.question === actual.question
        },
        items: matchResponses(expected.items, actual.items),
        exclusive: matchResponses(expected.exclusive, actual.exclusive),
        slots: {
            expected: expected.rankLimit,
            actual: actual.slotCount,
            match: expected.rankLimit == null || expected.rankLimit === actual.slotCount
        }
    };

}


if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        compareSurvey,
        splitLines,
        compareResponses,
        parseExpectedGrid,
        compareGrid,
        parseRankLimit,
        parseExpectedRanking,
        compareRanking
    };
}