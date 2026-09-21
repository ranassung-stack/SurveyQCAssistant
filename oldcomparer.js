function compareSurvey(expectedText, actualText) {

    const expectedLines = splitLines(expectedText);
    const actualLines = splitLines(actualText);

    const comparison = {

        question: {
            expected: expectedLines.shift() || "",
            actual: actualLines.shift() || "",
            match: false
        },

        responses: {
            modified: [],
            missing: [],
            extra: []
        }

    };

    //----------------------------------------------------
    // Compare Question
    //----------------------------------------------------

    comparison.question.match =
        comparison.question.expected === comparison.question.actual;

    //----------------------------------------------------
    // Compare Responses (ignore order)
    //----------------------------------------------------

    compareResponses(
        expectedLines,
        actualLines,
        comparison.responses
    );

    return comparison;

}


function splitLines(text) {

    return text
        .split("\n")
        .map(x => x.trim())
        .filter(x => x.length > 0);

}


function compareResponses(expected, actual, result) {

    // Make a copy so matched responses can't be reused
    const remainingActual = [...actual];

    expected.forEach(expectedItem => {

        // Exact match
        const exactIndex = remainingActual.indexOf(expectedItem);

        if (exactIndex !== -1) {

            remainingActual.splice(exactIndex, 1);
            return;

        }

        // Find best similar match
        const bestMatch = findBestMatch(
            expectedItem,
            remainingActual
        );

        if (bestMatch) {

            result.modified.push({

                expected: expectedItem,

                actual: bestMatch.match,

                score: bestMatch.score

            });

            // Remove matched response
            remainingActual.splice(bestMatch.index, 1);

        } else {

            result.missing.push(expectedItem);

        }

    });

    // Whatever remains is extra
    remainingActual.forEach(item => {

        result.extra.push(item);

    });

}