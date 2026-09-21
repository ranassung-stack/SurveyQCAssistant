//--------------------------------------------------
// Survey QC — Questionnaire parser
//--------------------------------------------------
//
// Turns a questionnaire into a list of questions, each made
// of paragraphs, each made of formatted runs. Two sources:
//
//   parseDocxDocument(xmlDoc)  -> from a .docx word/document.xml
//                                 (full formatting: b/i/u/color/font/size/vert)
//   parseQuestionnaireText(s)  -> from pasted plain text
//                                 (same shape, runs carry no formatting)
//
// Comparison stays text-based for now; formatting is captured
// and carried so it can be compared later without reshaping.
//--------------------------------------------------


//----------------------------------
// DOM helpers (namespace-agnostic)
//----------------------------------

function localOf(node) {
    return node.localName || (node.nodeName || "").replace(/^.*:/, "");
}

function descendantsByLocal(el, local) {
    const out = [];
    (function walk(n) {
        for (let c = n.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1) {
                if (localOf(c) === local) out.push(c);
                walk(c);
            }
        }
    })(el);
    return out;
}

function childByLocal(el, local) {
    for (let c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && localOf(c) === local) return c;
    }
    return null;
}

// Read a w:* attribute regardless of prefix
function wAttr(el, name) {
    if (!el || !el.attributes) return null;
    for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes[i];
        if (localOf(a) === name || a.name === "w:" + name) return a.value;
    }
    return null;
}

// A boolean run property (<w:b/>, <w:b w:val="false"/>, <w:b w:val="0"/>)
function boolProp(rPr, name) {
    const el = childByLocal(rPr, name);
    if (!el) return false;
    const val = wAttr(el, "val");
    if (val === null) return true;
    return !(val === "false" || val === "0" || val === "none");
}


//----------------------------------
// Run + paragraph extraction (docx)
//----------------------------------

function extractRun(rEl) {

    // text: concatenate w:t, treat w:tab as \t, w:br as space
    let text = "";
    for (const child of descendantsByLocal(rEl, "t")) text += child.textContent;
    // tabs/breaks live as siblings of w:t inside the run
    for (let c = rEl.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        const ln = localOf(c);
        if (ln === "tab") text += "\t";
        else if (ln === "br" || ln === "cr") text += " ";
    }

    const rPr = childByLocal(rEl, "rPr");

    const fmt = {
        bold: false, italic: false, underline: false,
        color: null, font: null, sizePt: null, vertAlign: null
    };

    if (rPr) {
        fmt.bold = boolProp(rPr, "b");
        fmt.italic = boolProp(rPr, "i");
        const u = childByLocal(rPr, "u");
        fmt.underline = !!u && wAttr(u, "val") !== "none";

        const color = childByLocal(rPr, "color");
        const cv = color && wAttr(color, "val");
        fmt.color = cv && cv.toLowerCase() !== "auto" ? cv.toUpperCase() : null;

        const rFonts = childByLocal(rPr, "rFonts");
        fmt.font = rFonts ? (wAttr(rFonts, "ascii") || wAttr(rFonts, "hAnsi")) : null;

        const sz = childByLocal(rPr, "sz");
        const sv = sz && wAttr(sz, "val");
        fmt.sizePt = sv ? Number(sv) / 2 : null;   // half-points -> points

        const va = childByLocal(rPr, "vertAlign");
        fmt.vertAlign = va ? wAttr(va, "val") : null; // "superscript" | "subscript"
    }

    return { text, fmt };
}

function extractParagraph(pEl) {
    const runs = descendantsByLocal(pEl, "r").map(extractRun).filter(r => r.text.length);
    const text = runs.map(r => r.text).join("");
    return { text, runs };
}


//----------------------------------
// Question splitting
//----------------------------------

// Default: a token at line start containing a digit, ending in . : ) tab or space
// e.g. Q1_HS.  S5_recode.  Q4_AFDB_N.  Q1_MTVN
const DEFAULT_QID = /^\s*([A-Za-z][A-Za-z0-9_]*\d[A-Za-z0-9_]*)\s*[.:)]?/;

function questionIdOf(text, qidRe) {
    const m = String(text).match(qidRe || DEFAULT_QID);
    return m ? m[1] : null;
}

function splitIntoQuestions(paragraphs, options) {
    const qidRe = (options && options.questionId) || DEFAULT_QID;

    const questions = [];
    let current = null;
    const preamble = [];

    paragraphs.forEach(p => {
        const id = p.text.trim() ? questionIdOf(p.text, qidRe) : null;
        if (id) {
            if (current) questions.push(current);
            current = { id, title: p.text.trim(), paragraphs: [p] };
        } else if (current) {
            current.paragraphs.push(p);
        } else if (p.text.trim()) {
            preamble.push(p);
        }
    });
    if (current) questions.push(current);

    return { questions, preamble };
}


//----------------------------------
// Public: parse a docx document.xml DOM
//----------------------------------

function parseDocxDocument(xmlDoc, options) {
    const root = xmlDoc.documentElement || xmlDoc;
    const paragraphs = descendantsByLocal(root, "p").map(extractParagraph);
    return splitIntoQuestions(paragraphs, options);
}

// Convenience for the browser: XML string -> parsed questions
function parseDocxXml(xmlString, options) {
    const doc = new DOMParser().parseFromString(xmlString, "application/xml");
    return parseDocxDocument(doc, options);
}


//----------------------------------
// Public: parse pasted plain text
//----------------------------------

function parseQuestionnaireText(text, options) {
    const paragraphs = String(text).split(/\r?\n/).map(line => ({
        text: line,
        runs: line.length ? [{ text: line, fmt: {
            bold: false, italic: false, underline: false,
            color: null, font: null, sizePt: null, vertAlign: null
        } }] : []
    }));
    return splitIntoQuestions(paragraphs, options);
}


if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseDocxDocument,
        parseDocxXml,
        parseQuestionnaireText,
        splitIntoQuestions,
        questionIdOf,
        extractParagraph,
        DEFAULT_QID
    };
}