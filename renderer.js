function renderIssues(issues) {

    if (!issues || issues.length === 0) {

        return `
            <div style="
                padding:12px;
                background:#e8f5e9;
                border:1px solid #81c784;
                border-radius:4px;
                color:#2e7d32;
                font-weight:bold;
            ">
                ✔ No issues found
            </div>
        `;

    }

    let html = "";

    //---------------------------------------
    // Summary
    //---------------------------------------

    html += `
        <div style="
            margin-bottom:12px;
            padding:8px;
            background:#f5f5f5;
            border:1px solid #ddd;
            border-radius:4px;
        ">
            <b>Total Issues:</b> ${issues.length}
        </div>
    `;

    //---------------------------------------
    // Table
    //---------------------------------------

    html += `
    <table style="
        width:100%;
        border-collapse:collapse;
        font-size:13px;
    ">

        <thead>

            <tr style="background:#eeeeee;">

                <th style="border:1px solid #ccc;padding:6px;">
                    Component
                </th>

                <th style="border:1px solid #ccc;padding:6px;">
                    Issue
                </th>

                <th style="border:1px solid #ccc;padding:6px;">
                    Expected
                </th>

                <th style="border:1px solid #ccc;padding:6px;">
                    Found
                </th>

            </tr>

        </thead>

        <tbody>
    `;

    issues.forEach(issue => {

        html += `
        <tr>

            <td style="
                border:1px solid #ddd;
                padding:6px;
                vertical-align:top;
            ">
                ${issue.component}
            </td>

            <td style="
                border:1px solid #ddd;
                padding:6px;
                vertical-align:top;
                font-weight:bold;
                color:${getIssueColor(issue.category)};
            ">
                ${issue.difference}
            </td>

            <td style="
                border:1px solid #ddd;
                padding:6px;
                vertical-align:top;
            ">
                ${formatCell(issue.expected, issue, "expected")}
            </td>

            <td style="
                border:1px solid #ddd;
                padding:6px;
                vertical-align:top;
            ">
                ${formatCell(issue.actual, issue, "actual")}
            </td>

        </tr>
        `;

    });

    html += `
        </tbody>
    </table>
    `;

    return html;

}

function formatCell(text, issue, side) {

    if (text === null || text === undefined || text === "") {

        return "<span style='color:#999;'>N/A</span>";

    }

    // Highlight only modified items
    if (issue && issue.category === "Modified") {

        const diff = highlightDifference(
            issue.expected,
            issue.actual
        );

        return side === "expected"
            ? diff.expected
            : diff.actual;

    }

    return escapeHtml(String(text));

}

function escapeHtml(text) {

    return String(text)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");

}

function getIssueColor(category){

    switch(category){

        case "Modified":
            return "#d32f2f";

        case "Missing":
            return "#f57c00";

        case "Extra":
            return "#1976d2";

        case "Formatting":
            return "#6a1b9a";

        default:
            return "#444";

    }

}