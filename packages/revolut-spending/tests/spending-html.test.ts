import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCategoryBreakdownHtml } from "../src/spending-html.js";

const breakdownHtml = `
<button data-event-key="action.analytics.transaction-breakdown.click">
  <span>Transfers</span><span>1 transaction</span><span>-RON&nbsp;1,234.50</span><span>82%</span>
</button>
<button data-event-key="action.analytics.transaction-breakdown.click">
  <span>Food &amp; drink</span><span>2 transactions</span><span>-RON&#160;12.75</span><span>1%</span>
</button>
<button data-event-key="action.analytics.transaction-breakdown.click">
  <span>Crème &amp; &quot;tea&quot; &lt;cake&gt; &apos;to-go&apos;</span><!-- hidden 99 transactions -RON 99 -->
  <span>3 transactions</span><span>RON&nbsp;5</span><span>&lt;1%</span>
</button>
<button data-event-key="other.action">
  <span>Not a category</span><span>5 transactions</span><span>-RON&nbsp;99</span>
</button>`;

test("PRD-005: extracts category labels and absolute RON values from HTML breakdown buttons", () => {
  assert.deepEqual(parseCategoryBreakdownHtml(breakdownHtml), [
    { category: "Transfers", ron: 1234.5 },
    { category: "Food & drink", ron: 12.75 },
    { category: 'Crème & "tea" <cake> \'to-go\'', ron: 5 },
  ]);
});

test("PRD-005: rejects HTML without a parseable category breakdown", () => {
  assert.throws(
    () => parseCategoryBreakdownHtml("<html><body>No category breakdown</body></html>"),
    /No category breakdown rows found/,
  );
  assert.throws(
    () => parseCategoryBreakdownHtml(
      '<button data-event-key="action.analytics.transaction-breakdown.click">Groceries 2 transactions 95%</button>',
    ),
    /Could not parse a category breakdown row/,
  );
  assert.throws(
    () => parseCategoryBreakdownHtml(
      `<button data-event-key="action.analytics.transaction-breakdown.click">Large 1 transaction -RON ${"9".repeat(400)}</button>`,
    ),
    /Could not parse a category breakdown row/,
  );
});
