//--------------------------------------------------
// Survey QC — Page reader (content script)
//--------------------------------------------------
//
// Extracts question text and responses from the live
// survey page. Response markup varies by widget, so
// options are read through ordered adapters; grids are
// detected separately and returned as structured data.
//--------------------------------------------------


function cleanText(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}


// innerText reflects rendered text (respects hidden elements) but falls
// back to textContent when unavailable/empty.
function elText(el) {
    if (!el) return "";
    const it = el.innerText;
    return cleanText(it != null && it !== "" ? it : el.textContent);
}


function extractLabel(el) {

    const clone = el.cloneNode(true);

    clone.querySelectorAll("input, select, textarea, script, style")
        .forEach(n => n.remove());

    return cleanText(clone.textContent);

}


// Inner HTML of an option, with form controls / icons / codes removed,
// so the popup can read its formatting (bold/italic/colour) from tags.
function optionHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
        "input, select, textarea, button, svg, i, .icon, .drag-drop-icon, center, script, style"
    ).forEach(n => n.remove());
    return clone.innerHTML.trim();
}


//--------------------------------------------------
// Response adapters (flat lists: single / multi)
// Each option is { text, html }.
//--------------------------------------------------

const RESPONSE_ADAPTERS = [

    // 1. Classic label widget
    {
        name: "label",
        getOptions: (q) => {
            const out = [];
            q.querySelectorAll("label.response-label").forEach(label => {
                const option = label.querySelector(".label-text");
                if (!option) return;
                let text = cleanText(option.textContent);
                const prompt = label.querySelector(".openend-inline-prompt");
                if (prompt) text += " " + cleanText(prompt.textContent);
                if (text) out.push({ text, html: option.innerHTML.trim() });
            });
            return out;
        }
    },

    // 2. Button / pill widget
    {
        name: "button",
        getOptions: (q) => {
            const out = [];
            q.querySelectorAll(".response-button, [role='checkbox'], [role='radio']")
                .forEach(el => {
                    const text = extractLabel(el);
                    if (text) out.push({ text, html: optionHtml(el) });
                });
            return out;
        }
    }

];


function getResponseOptions(question) {
    for (const adapter of RESPONSE_ADAPTERS) {
        const options = adapter.getOptions(question);
        if (options.length > 0) return options;
    }
    return [];
}


//--------------------------------------------------
// Grid extraction
//
// Rows come from each row's <th scope="row">. Columns are
// read from <thead> headers when present, otherwise derived
// from each input's aria-label ("Column: Row"). A cell is
// counted as present when its <td> contains a form control.
//--------------------------------------------------

function deriveColumnFromAria(aria, rowLabel) {

    if (!aria) return "";

    let s = cleanText(aria);

    if (rowLabel && s.toLowerCase().endsWith(rowLabel.toLowerCase())) {
        s = s.slice(0, s.length - rowLabel.length);
        s = s.replace(/[:\-\u2013\u2014]\s*$/, "");
    } else if (s.indexOf(":") !== -1) {
        s = s.split(":")[0];
    }

    return cleanText(s);

}


// Scale-button label with the response code stripped
// e.g. "Strongly disagree 1" -> "Strongly disagree"
function extractScaleLabel(btn) {
    const clone = btn.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, center, script, style")
        .forEach(n => n.remove());
    let t = cleanText(clone.textContent);
    t = t.replace(/\s*\d+\s*$/, "");   // safety net if the code isn't in <center>
    return cleanText(t);
}


//--------------------------------------------------
// Dynamic grid ("dyngrid"): every statement is a
// .dyngrid-phase already in the DOM (some visibility-hidden),
// each holding its statement text plus the repeated scale as
// radio buttons. Read as rows (statements) x columns (scale).
//--------------------------------------------------

function extractDynGrid(question) {

    const phases = [...question.querySelectorAll(".dyngrid-phase")];
    if (!phases.length) return null;

    const scaleOf = (phase) => [
        ...phase.querySelectorAll(".response-button, [role='radio'], [role='checkbox']")
    ].map(extractScaleLabel).filter(Boolean);

    // Canonical scale taken from the first phase
    const columnOrder = scaleOf(phases[0]);
    if (columnOrder.length < 2) return null;

    const rowRecords = [];

    phases.forEach(phase => {

        // Statement = phase text with the scale removed
        const clone = phase.cloneNode(true);
        clone.querySelectorAll(
            ".question-response-list, .dynamic-row, .response-button, input"
        ).forEach(n => n.remove());
        const rowLabel = cleanText(clone.textContent);
        if (!rowLabel) return;

        const present = new Set(scaleOf(phase));
        const cells = {};
        columnOrder.forEach(col => { cells[col] = present.has(col); });

        rowRecords.push({ label: rowLabel, cells });

    });

    if (!rowRecords.length) return null;

    const missingCells = [];
    rowRecords.forEach(r => {
        columnOrder.forEach(col => {
            if (!r.cells[col]) missingCells.push({ row: r.label, column: col });
        });
    });

    const legend = question.querySelector("legend.question-text");

    return {
        question: elText(legend),
        columns: columnOrder,
        rows: rowRecords.map(r => r.label),
        missingCells
    };

}


function extractGrid(question) {

    const table = question.querySelector("table");
    if (!table) return null;

    let dataRows = [...table.querySelectorAll("tbody tr")];
    if (!dataRows.length) {
        dataRows = [...table.querySelectorAll("tr")].filter(tr => tr.querySelector("td"));
    }
    if (!dataRows.length) return null;

    // Header column labels (best effort, drops the empty corner cell)
    const headerCells = [...table.querySelectorAll("thead th, thead td")]
        .map(th => cleanText(th.textContent))
        .filter(Boolean);

    const columnOrder = [];
    const rowRecords = [];

    dataRows.forEach(tr => {

        const labelCell = tr.querySelector('th[scope="row"]') || tr.querySelector("th") || tr.querySelector("td");
        const rowLabel = cleanText(labelCell ? labelCell.textContent : "");

        const cellTds = [...tr.querySelectorAll("td")];
        const cells = {};

        cellTds.forEach((td, i) => {

            const input = td.querySelector(
                "input, select, textarea, [role='checkbox'], [role='radio']"
            );

            let colLabel = headerCells[i] || "";

            if (!colLabel && input) {
                colLabel = deriveColumnFromAria(input.getAttribute("aria-label"), rowLabel);
            }
            if (!colLabel) colLabel = "Column " + (i + 1);

            if (columnOrder.indexOf(colLabel) === -1) columnOrder.push(colLabel);

            cells[colLabel] = !!input;

        });

        rowRecords.push({ label: rowLabel, cells });

    });

    // Rectangular-completeness check -> missing cells
    const missingCells = [];
    rowRecords.forEach(r => {
        columnOrder.forEach(col => {
            if (!r.cells[col]) missingCells.push({ row: r.label, column: col });
        });
    });

    const legend = question.querySelector("legend.question-text");

    return {
        question: elText(legend),
        columns: columnOrder,
        rows: rowRecords.map(r => r.label),
        missingCells
    };

}


//--------------------------------------------------
// Ranking / drag-drop
//
// Draggable topics are .ui-draggable (.rankSelect), each
// with a drag-handle icon to strip. Rank slots are .rankPlace
// (numbered drop targets) — counted, not compared. Exclusive
// options (e.g. "None") are label.dk-input.
//--------------------------------------------------

function extractRankItem(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
        "button, svg, i, .icon, .drag-drop-icon, .select .icon, input, script, style"
    ).forEach(n => n.remove());
    return cleanText(clone.textContent);
}


function extractRanking(question) {

    const slots = [...question.querySelectorAll(".rankPlace")];
    const draggables = [...question.querySelectorAll(".ui-draggable, .rankSelect")];

    if (!slots.length || !draggables.length) return null;

    const items = draggables.map(extractRankItem).filter(Boolean);

    // Exclusive options may sit outside the fieldset — fall back to document
    let dk = [...question.querySelectorAll(".dk-input")];
    if (!dk.length) dk = [...document.querySelectorAll(".dk-input")];

    const exclusive = [...new Set(
        dk.map(el => {
            const label = el.querySelector(".dk-label");
            return cleanText(label ? label.textContent : extractLabel(el));
        }).filter(Boolean)
    )];

    const legend = question.querySelector("legend.question-text");

    return {
        question: elText(legend),
        items,
        slotCount: slots.length,
        slotNumbers: slots.map(s => cleanText((s.querySelector(".number") || {}).textContent)),
        exclusive
    };

}


//--------------------------------------------------
// Resolve the question container.
// Prefer fieldset.question; fall back to whatever wraps
// legend.question-text; finally the whole document. This
// keeps every reader working on layouts that don't use
// the fieldset wrapper (e.g. some ranking pages).
//--------------------------------------------------

function resolveQuestionRoot() {

    // Prefer the fieldset wrapper when present; otherwise search the
    // whole document (the legend's nearest wrapper can't be trusted to
    // contain the response widget). Single-question pages only for now.
    return document.querySelector("fieldset.question") || document;

}


//--------------------------------------------------
// Capture the question legend's HTML for formatting QC.
// Survey-specific chrome (the validation-note alert, form
// controls) is stripped here, at the page-reader layer, so
// the popup receives clean markup it can read formatting from.
//--------------------------------------------------

function questionLegendHtml(question) {

    const legend = question.querySelector("legend.question-text");
    if (!legend) return "";

    const clone = legend.cloneNode(true);

    clone.querySelectorAll(
        "[role='alert'], [id*='response_note'], .alert, input, select, textarea, script, style"
    ).forEach(n => n.remove());

    return clone.innerHTML;

}


//--------------------------------------------------
// Assemble everything the popup needs
//--------------------------------------------------

function getPageData() {

    const question = resolveQuestionRoot();

    const lines = [];
    const blocks = [];   // [{ role, text, html }] — html carries formatting

    const legend = question.querySelector("legend.question-text");
    if (legend) {
        const qText = elText(legend);
        lines.push(qText);
        blocks.push({ role: "question", text: qText, html: questionLegendHtml(question) });
    }

    // Ranking takes precedence (it has its own drag-drop widget)
    const ranking = extractRanking(question);

    // Otherwise: dynamic grid, then classic table grid.
    let grid = ranking ? null : (extractDynGrid(question) || extractGrid(question));
    if (!grid || grid.columns.length < 2 || grid.rows.length < 1) {
        grid = null;
    }

    if (ranking) {
        ranking.items.forEach(i => { lines.push(i); blocks.push({ role: "item", text: i, html: null }); });
        ranking.exclusive.forEach(e => { lines.push(e); blocks.push({ role: "exclusive", text: e, html: null }); });
    } else if (grid) {
        grid.rows.forEach(r => { lines.push(r); blocks.push({ role: "row", text: r, html: null }); });
        grid.columns.forEach(c => { lines.push(c); blocks.push({ role: "column", text: c, html: null }); });
    } else {
        getResponseOptions(question).forEach(o => {
            lines.push(o.text);
            blocks.push({ role: "option", text: o.text, html: o.html });
        });
    }

    return { pageText: lines.join("\n"), grid, ranking, questionHtml: questionLegendHtml(question), blocks };

}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getText") {
        sendResponse(getPageData());
    }
});
