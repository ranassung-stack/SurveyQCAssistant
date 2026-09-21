//--------------------------------------------------
// Survey QC — Matching Engine
//--------------------------------------------------
//
// Pure logic. Runs as a global inside the extension
// (loaded by popup.html <script> tags) AND is importable
// in Node for testing via the export shim at the bottom.
//--------------------------------------------------


//--------------------------------------------------
// Resolve config safely whether or not CONFIG exists
// (CONFIG is a global in the extension; absent in tests)
//--------------------------------------------------

function matchConfig() {

    if (typeof CONFIG !== "undefined") {
        return CONFIG;
    }

    return {
        matchingThreshold: 60,
        ignorePunctuation: true
    };

}


//--------------------------------------------------
// Tokenise text into a normalized word array
// Honors CONFIG.ignorePunctuation (previously ignored)
//--------------------------------------------------

function getWords(text) {

    const cfg = matchConfig();

    let t = String(text).toLowerCase();

    if (cfg.ignorePunctuation) {
        t = t.replace(/[^\w\s]/g, "");
    }

    return t.split(/\s+/).filter(Boolean);

}


//--------------------------------------------------
// Token similarity — true Jaccard (0-100)
//   |A ∩ B| / |A ∪ B|
// Symmetric, so extra words in the candidate now
// lower the score instead of being ignored.
//--------------------------------------------------

function jaccard(aWords, bWords) {

    const A = new Set(aWords);
    const B = new Set(bWords);

    if (A.size === 0 && B.size === 0) return 100;

    let inter = 0;
    A.forEach(w => { if (B.has(w)) inter++; });

    const union = A.size + B.size - inter;

    if (union === 0) return 0;

    return (inter / union) * 100;

}


//--------------------------------------------------
// Levenshtein edit distance (two-row, O(n) space)
//--------------------------------------------------

function levenshtein(a, b) {

    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {

        curr[0] = i;

        for (let j = 1; j <= b.length; j++) {

            const cost = a[i - 1] === b[j - 1] ? 0 : 1;

            curr[j] = Math.min(
                prev[j] + 1,        // deletion
                curr[j - 1] + 1,    // insertion
                prev[j - 1] + cost  // substitution
            );

        }

        const tmp = prev; prev = curr; curr = tmp;

    }

    return prev[b.length];

}


//--------------------------------------------------
// Normalised character similarity (0-100)
//--------------------------------------------------

function levRatio(a, b) {

    const max = Math.max(a.length, b.length);

    if (max === 0) return 100;

    return (1 - levenshtein(a, b) / max) * 100;

}


//--------------------------------------------------
// Negation awareness
//
// "Very important" vs "Not very important" are highly
// similar as strings but opposite in meaning. A polarity
// mismatch is exactly the kind of scale error QC must
// catch, so it is penalised hard rather than matched.
//--------------------------------------------------

const NEGATION = /\b(not|no|never|none|cannot|can't|nor|neither|without|n't)\b/i;

function hasNegation(text) {
    return NEGATION.test(String(text));
}


//--------------------------------------------------
// Core similarity metric (0-100)
//
// Accepts raw strings OR pre-tokenised arrays, so the
// previous callers keep working unchanged.
//--------------------------------------------------

function calculateSimilarity(expected, candidate) {

    const expText = Array.isArray(expected) ? expected.join(" ") : String(expected);
    const canText = Array.isArray(candidate) ? candidate.join(" ") : String(candidate);

    const expWords = getWords(expText);
    const canWords = getWords(canText);

    const expNorm = expWords.join(" ");
    const canNorm = canWords.join(" ");

    let score;

    if (expWords.length <= 1 && canWords.length <= 1) {

        // Single tokens: word-set overlap is useless,
        // character similarity carries the signal (typos).
        score = levRatio(expNorm, canNorm);

    } else {

        // Blend token overlap with character similarity.
        // Char-level is weighted higher because it degrades
        // gracefully with length and catches small edits.
        score = 0.4 * jaccard(expWords, canWords) +
                0.6 * levRatio(expNorm, canNorm);

    }

    if (hasNegation(expText) !== hasNegation(canText)) {
        score *= 0.4;
    }

    return Math.round(score);

}


//--------------------------------------------------
// Find Best Match (single expected vs candidates)
// Same signature and return shape as before.
//--------------------------------------------------

function findBestMatch(expected, candidates) {

    const cfg = matchConfig();

    let bestMatch = null;
    let bestScore = -1;
    let bestIndex = -1;

    candidates.forEach((candidate, index) => {

        const score = calculateSimilarity(expected, candidate);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
            bestIndex = index;
        }

    });

    if (bestMatch !== null && bestScore >= cfg.matchingThreshold) {

        return {
            match: bestMatch,
            score: bestScore,
            index: bestIndex
        };

    }

    return null;

}


//--------------------------------------------------
// Match a full list of responses (order-independent)
//
// Global best-first assignment. Exact matches are locked
// first, then remaining pairs are scored and assigned
// highest-first so a short option can no longer "steal"
// the partner that belongs to a closer one.
//
// Returns { modified, missing, extra } — same shape the
// comparer/renderer already expect.
//--------------------------------------------------

function matchResponses(expectedList, actualList) {

    const result = { modified: [], missing: [], extra: [] };

    const expected = expectedList.map((t, i) => ({ t, i, used: false }));
    const actual = actualList.map((t, i) => ({ t, i, used: false }));

    // 1. Exact matches, one-to-one
    expected.forEach(e => {
        const hit = actual.find(a => !a.used && a.t === e.t);
        if (hit) { e.used = true; hit.used = true; }
    });

    // 2. Score every remaining pair above threshold
    const cfg = matchConfig();
    const pairs = [];

    expected.filter(e => !e.used).forEach(e => {
        actual.filter(a => !a.used).forEach(a => {
            const score = calculateSimilarity(e.t, a.t);
            if (score >= cfg.matchingThreshold) {
                pairs.push({ e, a, score });
            }
        });
    });

    // 3. Assign highest-scoring pairs first
    pairs.sort((p, q) => q.score - p.score);

    pairs.forEach(p => {
        if (!p.e.used && !p.a.used) {
            p.e.used = true;
            p.a.used = true;
            result.modified.push({
                expected: p.e.t,
                actual: p.a.t,
                score: p.score
            });
        }
    });

    // 4. Whatever is left over
    expected.filter(e => !e.used).forEach(e => result.missing.push(e.t));
    actual.filter(a => !a.used).forEach(a => result.extra.push(a.t));

    return result;

}


//--------------------------------------------------
// Node export shim (no effect in the browser)
//--------------------------------------------------

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        getWords,
        jaccard,
        levenshtein,
        levRatio,
        hasNegation,
        calculateSimilarity,
        findBestMatch,
        matchResponses
    };
}