//--------------------------------------------------
// Survey QC — Formatting engine
//--------------------------------------------------
//
// Reads formatting as tags/inline-style from BOTH sides
// (the pasted spec HTML and the survey DOM share the same
// vocabulary: b/strong, i/em, u, sup, sub, and colour).
// Font and size are intentionally ignored.
//
// Comparison is word-aligned: for a block whose words match
// textually, each word's formatting is compared and any
// difference is reported (missing/unexpected bold, etc.).
//--------------------------------------------------


const BLANK_FMT = {
    bold: false, italic: false, underline: false,
    color: "000000", vert: null
};


//----------------------------------
// Colour canonicalization
// absent / auto / black -> "000000"; rgb() -> hex; upper 6-hex
//----------------------------------

function canonColor(c) {
    if (!c) return "000000";
    let s = String(c).trim().toLowerCase();
    if (s === "auto" || s === "transparent" || s === "inherit" ||
        s === "currentcolor" || s === "black" || s === "windowtext") return "000000";

    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
        const h = n => Number(n).toString(16).padStart(2, "0");
        s = h(m[1]) + h(m[2]) + h(m[3]);
    } else {
        s = s.replace(/^#/, "");
        if (s.length === 3) s = s.split("").map(x => x + x).join("");
    }

    s = s.toUpperCase();
    return /^[0-9A-F]{6}$/.test(s) ? s : "000000";
}


function fmtEqual(a, b) {
    return a.bold === b.bold &&
           a.italic === b.italic &&
           a.underline === b.underline &&
           canonColor(a.color) === canonColor(b.color) &&
           (a.vert || null) === (b.vert || null);
}

// Human-readable list of differences, phrased from the survey's POV
function fmtDiffs(exp, act) {
    const d = [];
    if (exp.bold !== act.bold) d.push(act.bold ? "unexpected bold" : "missing bold");
    if (exp.italic !== act.italic) d.push(act.italic ? "unexpected italic" : "missing italic");
    if (exp.underline !== act.underline) d.push(act.underline ? "unexpected underline" : "missing underline");
    const ec = canonColor(exp.color), ac = canonColor(act.color);
    if (ec !== ac) d.push("colour " + ec + " \u2192 " + ac);
    if ((exp.vert || null) !== (act.vert || null))
        d.push("vertical-align " + (exp.vert || "none") + " \u2192 " + (act.vert || "none"));
    return d;
}


//----------------------------------
// DOM/HTML -> formatted runs
//----------------------------------

function applyTagFmt(fmt, el) {
    const tag = (el.tagName || "").toLowerCase();
    const f = Object.assign({}, fmt);

    if (tag === "b" || tag === "strong") f.bold = true;
    if (tag === "i" || tag === "em") f.italic = true;
    if (tag === "u" || tag === "ins") f.underline = true;
    if (tag === "sup") f.vert = "superscript";
    if (tag === "sub") f.vert = "subscript";

    const style = el.getAttribute && el.getAttribute("style");
    if (style) {
        if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) f.bold = true;
        if (/font-style\s*:\s*italic/i.test(style)) f.italic = true;
        if (/text-decoration[^;]*underline/i.test(style)) f.underline = true;
        if (/vertical-align\s*:\s*super/i.test(style)) f.vert = "superscript";
        if (/vertical-align\s*:\s*sub/i.test(style)) f.vert = "subscript";
        const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (cm) f.color = cm[1].trim();
    }
    return f;
}

// Walk a DOM node into runs. skipMatch(el) => true skips that subtree
// (used to drop the survey's validation-note alert).
function runsFromNode(node, skipMatch) {
    const runs = [];

    (function walk(el, fmt) {
        for (let c = el.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 3) {
                if (c.textContent) runs.push({ text: c.textContent, fmt: Object.assign({}, fmt) });
            } else if (c.nodeType === 1) {
                const tag = (c.tagName || "").toLowerCase();
                if (tag === "script" || tag === "style" || tag === "o:p") continue;
                if (skipMatch && skipMatch(c)) continue;
                if (tag === "br") { runs.push({ text: "\n", fmt: Object.assign({}, fmt) }); continue; }
                const before = runs.length;
                walk(c, applyTagFmt(fmt, c));
                // A block element implies a line break AFTER it — but only
                // if it actually produced content. An empty <p></p> (common
                // in Word paste) must not inject a phantom break/plain run.
                if (/^(p|div|li|tr|h[1-6])$/.test(tag) && runs.length > before) {
                    runs.push({ text: "\n", fmt: Object.assign({}, BLANK_FMT) });
                }
            }
        }
    })(node, Object.assign({}, BLANK_FMT));

    return runs;
}

// Browser convenience: parse an HTML string into runs
function runsFromHtml(html, skipMatch) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return runsFromNode(doc.body, skipMatch);
}


//----------------------------------
// Word-level comparison
//----------------------------------

function wordsWithFmt(runs) {
    const chars = [];
    runs.forEach(r => { for (const ch of r.text) chars.push({ ch, fmt: r.fmt }); });

    const words = [];
    let cur = null;
    chars.forEach(({ ch, fmt }) => {
        if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } }
        else { if (!cur) cur = { word: "", fmt }; cur.word += ch; }
    });
    if (cur) words.push(cur);
    return words;
}

function normWord(w) {
    return String(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function tokens(runs) {
    return wordsWithFmt(runs)
        .map(x => ({ w: normWord(x.word), raw: x.word, fmt: x.fmt }))
        .filter(t => t.w.length > 0);
}

// Find where the actual token run sits inside the expected tokens
// (the expected/spec side may carry a leading code like "1" that the
// survey option doesn't). Returns the offset, or -1 if no clean match.
function alignOffset(e, a) {
    if (a.length === 0 || a.length > e.length) {
        return (e.length === a.length && e.every((t, i) => t.w === a[i].w)) ? 0 : -1;
    }
    for (let o = 0; o + a.length <= e.length; o++) {
        let ok = true;
        for (let i = 0; i < a.length; i++) {
            if (e[o + i].w !== a[i].w) { ok = false; break; }
        }
        if (ok) return o;
    }
    return -1;
}

// Compare formatting of a block. Aligns the survey's words within the
// spec's words (tolerating a leading code), then compares each word's
// formatting. Returns aligned:false when the words don't line up (a
// text difference the text comparer already reports).
function compareBlockFormatting(expectedRuns, actualRuns) {
    const e = tokens(expectedRuns);
    const a = tokens(actualRuns);

    const off = alignOffset(e, a);
    if (off < 0) return { aligned: false, issues: [] };

    const issues = [];
    for (let i = 0; i < a.length; i++) {
        if (!fmtEqual(e[off + i].fmt, a[i].fmt)) {
            issues.push({
                word: a[i].raw,
                expected: e[off + i].fmt,
                actual: a[i].fmt,
                diffs: fmtDiffs(e[off + i].fmt, a[i].fmt)
            });
        }
    }
    return { aligned: true, issues };
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        alignOffset,
        BLANK_FMT, canonColor, fmtEqual, fmtDiffs,
        runsFromNode, runsFromHtml, wordsWithFmt, tokens,
        compareBlockFormatting
    };
}
