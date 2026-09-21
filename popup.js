//--------------------------------------------------
// Survey QC — Popup controller
//--------------------------------------------------


function errorBox(msg) {
    return "<div style='color:#c62828;padding:8px;"
        + "background:#ffebee;border:1px solid #ef9a9a;"
        + "border-radius:4px;'>" + msg + "</div>";
}

function noticeBox(msg) {
    return "<div style='color:#1565c0;padding:8px;margin-bottom:8px;"
        + "background:#e3f2fd;border:1px solid #90caf9;"
        + "border-radius:4px;'>" + msg + "</div>";
}


//--------------------------------------------------
// Read the live page, injecting the reader on demand
// if the persistent content script isn't responding.
//--------------------------------------------------

function getActualText(tabId) {

    const send = () => new Promise(resolve => {
        try {
            chrome.tabs.sendMessage(tabId, { action: "getText" }, (resp) => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(resp);
            });
        } catch (e) {
            resolve(null);
        }
    });

    return (async () => {

        let resp = await send();
        if (resp && typeof resp.pageText !== "undefined") return resp;

        try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        } catch (e) {
            return { error: "Couldn't load the page reader (" + e.message
                + "). This may not be a supported survey page." };
        }

        resp = await send();
        if (resp && typeof resp.pageText !== "undefined") return resp;

        return { error: "The page didn't respond. Reload the survey page and try again." };

    })();

}


//--------------------------------------------------
// Issue builders
//--------------------------------------------------

function pushModifiedWithFormatting(issues, component, expected, actual) {

    const difference = getDifference(expected, actual);
    const spacing = getFormattingIssues(expected, actual, component);

    // A "Modified" row with nothing to say (only invisible/trimmed
    // whitespace differed) is noise — skip it entirely.
    if (difference) {
        issues.push({ component, category: "Modified", expected, actual, difference });
    }

    spacing.forEach(issue => {
        issues.push({
            component: issue.component,
            category: "Formatting",
            expected: issue.expected,
            actual: issue.found,
            difference: issue.difference
        });
    });

}


function buildIssues(comparison) {

    const issues = [];

    if (!comparison.question.match) {
        pushModifiedWithFormatting(issues, "Question",
            comparison.question.expected, comparison.question.actual);
    }

    comparison.responses.modified.forEach(item =>
        pushModifiedWithFormatting(issues, "Response", item.expected, item.actual));

    comparison.responses.missing.forEach(item =>
        issues.push({ component: "Response", category: "Missing",
            expected: item, actual: "", difference: "Missing response option" }));

    comparison.responses.extra.forEach(item =>
        issues.push({ component: "Response", category: "Extra",
            expected: "", actual: item, difference: "Extra response option" }));

    return issues;

}


function buildGridIssues(cmp) {

    const issues = [];

    if (!cmp.question.match) {
        pushModifiedWithFormatting(issues, "Question",
            cmp.question.expected, cmp.question.actual);
    }

    const axis = (matched, label) => {
        matched.modified.forEach(item =>
            pushModifiedWithFormatting(issues, label, item.expected, item.actual));
        matched.missing.forEach(item =>
            issues.push({ component: label, category: "Missing",
                expected: item, actual: "", difference: "Missing " + label.toLowerCase() }));
        matched.extra.forEach(item =>
            issues.push({ component: label, category: "Extra",
                expected: "", actual: item, difference: "Extra " + label.toLowerCase() }));
    };

    axis(cmp.rows, "Row");
    axis(cmp.columns, "Column");

    (cmp.cells.missing || []).forEach(c =>
        issues.push({ component: "Cell", category: "Missing",
            expected: c.row + "  ×  " + c.column, actual: "",
            difference: "Missing cell" }));

    return issues;

}


function buildRankingIssues(cmp) {

    const issues = [];

    if (!cmp.question.match) {
        pushModifiedWithFormatting(issues, "Question",
            cmp.question.expected, cmp.question.actual);
    }

    cmp.items.modified.forEach(item =>
        pushModifiedWithFormatting(issues, "Item", item.expected, item.actual));
    cmp.items.missing.forEach(item =>
        issues.push({ component: "Item", category: "Missing",
            expected: item, actual: "", difference: "Missing item" }));
    cmp.items.extra.forEach(item =>
        issues.push({ component: "Item", category: "Extra",
            expected: "", actual: item, difference: "Extra item" }));

    cmp.exclusive.modified.forEach(item =>
        pushModifiedWithFormatting(issues, "Option", item.expected, item.actual));
    cmp.exclusive.missing.forEach(item =>
        issues.push({ component: "Option", category: "Missing",
            expected: item, actual: "", difference: "Missing exclusive option" }));
    cmp.exclusive.extra.forEach(item =>
        issues.push({ component: "Option", category: "Extra",
            expected: "", actual: item, difference: "Extra exclusive option" }));

    if (!cmp.slots.match) {
        issues.push({
            component: "Rank slots",
            category: "Modified",
            expected: cmp.slots.expected == null ? "(not in spec)" : String(cmp.slots.expected),
            actual: String(cmp.slots.actual),
            difference: "Rank-slot count differs"
        });
    }

    return issues;

}


//--------------------------------------------------
// Formatting helpers
//--------------------------------------------------

// Split the paste box (rich contenteditable or plain textarea) into
// blocks — one per line — each with its formatted runs.
function splitBoxIntoBlocks(boxEl) {
    const runs = runsFromNode(boxEl);   // formatting.js
    const blocks = [];
    let cur = [];
    runs.forEach(r => {
        const parts = r.text.split("\n");
        parts.forEach((p, idx) => {
            if (idx > 0) { blocks.push(cur); cur = []; }
            if (p) cur.push({ text: p, fmt: r.fmt });
        });
    });
    if (cur.length) blocks.push(cur);
    return blocks
        .map(rs => ({ text: rs.map(x => x.text).join(""), runs: rs }))
        .filter(b => b.text.trim());
}

function readExpected(box) {
    const isRich = box.isContentEditable ||
        box.getAttribute("contenteditable") === "true";
    if (isRich) {
        return { text: box.innerText, blocks: splitBoxIntoBlocks(box) };
    }
    const text = box.value || "";
    const blocks = text.split(/\r?\n/).filter(l => l.trim())
        .map(l => ({ text: l, runs: [{ text: l, fmt: BLANK_FMT }] }));
    return { text, blocks };
}

function describeFmt(f) {
    const p = [];
    if (f.bold) p.push("bold");
    if (f.italic) p.push("italic");
    if (f.underline) p.push("underline");
    if (f.vert) p.push(f.vert);
    const c = canonColor(f.color);
    if (c !== "000000") p.push("#" + c);
    return p.length ? p.join("+") : "plain";
}

// Compare formatting for every expected block against the text-matched
// survey block. Only blocks whose text matches (and that carry HTML on
// the survey side) are compared; the rest are handled as text issues.
function buildFormattingIssues(expectedBlocks, actualBlocks) {
    const issues = [];

    const actualMap = new Map();
    (actualBlocks || []).forEach(b => {
        if (!b.html) return;
        const key = normalizeQuestion(b.text);
        if (!actualMap.has(key)) actualMap.set(key, runsFromHtml(b.html));
    });

    expectedBlocks.forEach(eb => {
        const key = normalizeQuestion(eb.text);
        const actRuns = actualMap.get(key);
        if (!actRuns) return;

        const cmp = compareBlockFormatting(eb.runs, actRuns);
        if (!cmp.aligned) return;

        cmp.issues.forEach(is => {
            issues.push({
                component: "Formatting",
                category: "Formatting",
                expected: is.word + " \u2014 " + describeFmt(is.expected),
                actual: is.word + " \u2014 " + describeFmt(is.actual),
                difference: is.diffs.join("; ")
            });
        });
    });

    return issues;
}


//--------------------------------------------------
// Compare button
//--------------------------------------------------

document
.getElementById("compareBtn")
.addEventListener("click", async () => {

    const results = document.getElementById("results");
    results.innerHTML = "<div style='color:#666;padding:8px;'>Comparing…</div>";

    try {

        const box = document.getElementById("expectedText");
        const { text: rawExpected, blocks: expectedBlocks } = readExpected(box);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { results.innerHTML = errorBox("No active tab found."); return; }

        const pageResp = await getActualText(tab.id);
        if (pageResp.error) { results.innerHTML = errorBox(pageResp.error); return; }

        // Formatting differences apply to every path (question + options)
        const formattingIssues = buildFormattingIssues(expectedBlocks, pageResp.blocks);

        //--------------------------------------------
        // Ranking path
        //--------------------------------------------
        if (pageResp.ranking) {

            const er = parseExpectedRanking(rawExpected);

            const ar = {
                question: normalizeQuestion(pageResp.ranking.question),
                items: pageResp.ranking.items.map(i => normalizeQuestion(i)).filter(Boolean),
                exclusive: pageResp.ranking.exclusive.map(e => normalizeQuestion(e)).filter(Boolean),
                slotCount: pageResp.ranking.slotCount
            };

            const cmp = compareRanking(er, ar);

            const header = noticeBox(
                "Ranking detected: " + ar.items.length + " items, "
                + ar.slotCount + " rank slots"
                + (er.rankLimit != null ? " (spec expects " + er.rankLimit + ")" : "")
                + (ar.exclusive.length ? ", " + ar.exclusive.length + " exclusive option(s)" : "")
            );

            results.innerHTML = header + renderIssues(buildRankingIssues(cmp).concat(formattingIssues));
            return;

        }

        //--------------------------------------------
        // Grid path
        //--------------------------------------------
        if (pageResp.grid) {

            const expectedGrid = parseExpectedGrid(rawExpected);

            if (!expectedGrid) {
                results.innerHTML = errorBox(
                    "This page is a grid, but your spec has no [ROWS] / [COLUMNS] "
                    + "sections. Add them (rows = statements, columns = scale points) "
                    + "for full grid QC."
                );
                return;
            }

            const actualGrid = {
                question: normalizeQuestion(pageResp.grid.question),
                rows: pageResp.grid.rows.map(r => normalizeQuestion(r)).filter(Boolean),
                columns: pageResp.grid.columns.map(c => normalizeQuestion(c)).filter(Boolean),
                missingCells: pageResp.grid.missingCells
            };

            const gridComparison = compareGrid(expectedGrid, actualGrid);
            const issues = buildGridIssues(gridComparison).concat(formattingIssues);

            const header = noticeBox(
                "Grid detected: " + actualGrid.rows.length + " rows × "
                + actualGrid.columns.length + " columns."
            );

            results.innerHTML = header + renderIssues(issues);
            return;

        }

        //--------------------------------------------
        // Flat list path (single / multi)
        //--------------------------------------------
        const expected = normalizeQuestion(rawExpected);
        const actual = normalizeQuestion(pageResp.pageText || "");

        if (!actual) {
            results.innerHTML = errorBox(
                "Read the page but found no question or response text. "
                + "Is a survey question visible on this page?"
            );
            return;
        }

        const comparison = compareSurvey(expected, actual);
        results.innerHTML = renderIssues(buildIssues(comparison).concat(formattingIssues));

    } catch (e) {
        console.error("Survey QC error:", e);
        results.innerHTML = errorBox(
            "Something went wrong: " + (e && e.message ? e.message : String(e))
        );
    }

});
