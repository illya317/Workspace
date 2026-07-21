import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchChinaMoneyCentralParity,
  normalizeChinaMoneyQuote,
} from "./chinamoney-exchange-rates";

test("normalizes direct, 100-unit and inverse ChinaMoney currency pairs", () => {
  assert.equal(normalizeChinaMoneyQuote({ sourcePair: "CAD/CNY", rateDate: "2025-12-31", price: 5.1142 }).rate, 5.1142);
  assert.equal(normalizeChinaMoneyQuote({ sourcePair: "100JPY/CNY", rateDate: "2025-12-31", price: 4.6 }).rate, 0.046);
  assert.equal(normalizeChinaMoneyQuote({ sourcePair: "CNY/MOP", rateDate: "2025-12-31", price: 1.12 }).rate, 1 / 1.12);
});

test("selects the latest historical central parity on or before the target date", async () => {
  const fetcher = async () => new Response(JSON.stringify({
    data: {
      searchlist: ["CAD/CNY"],
      records: [
        { date: "2025-12-30", values: ["5.1000"] },
        { date: "2025-12-31", values: ["5.1142"] },
      ],
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const quote = await fetchChinaMoneyCentralParity({
    currencyCode: "CAD",
    targetDate: "2025-12-31",
    fetcher: fetcher as typeof fetch,
  });
  assert.equal(quote.rateDate, "2025-12-31");
  assert.equal(quote.rate, 5.1142);
  assert.equal(quote.sourcePair, "CAD/CNY");
});
