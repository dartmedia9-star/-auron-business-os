/**
 * Unit checks for the shared money format and money-input parsing
 * (artifacts/auron-os/src/lib/money.ts). No server or database needed.
 *
 *   npx tsx ./test-money-format.ts      (from scripts/)
 */
import {
  formatMoney,
  formatAmount,
  formatAxisMoney,
  parseAmount,
  roundMoney,
  sanitizeAmountInput,
  sumMoney,
} from "../artifacts/auron-os/src/lib/money";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// 10. Display format #,##0.00 with the ₹ symbol.
check("10. 10000 → ₹10,000.00", formatMoney(10000), "₹10,000.00");
check("10. 100000 → ₹100,000.00", formatMoney(100000), "₹100,000.00");
check("10. 5000 → ₹5,000.00", formatMoney(5000), "₹5,000.00");
check("10. 0 → ₹0.00", formatMoney(0), "₹0.00");
check("10. Without symbol: 10000 → 10,000.00", formatAmount(10000), "10,000.00");
check("10. Numeric strings from the API format too", formatMoney("118000"), "₹118,000.00");
check("10. Null shows a dash", formatMoney(null), "—");
check("10. Negative keeps the sign", formatMoney(-1234.5), "-₹1,234.50");
check("10. -0 never shows as negative", formatMoney(-0.001), "₹0.00");

// 11. Large values.
check("11. 123,456,789.99", formatMoney(123456789.99), "₹123,456,789.99");
check("11. 900,000,000 (valuation target)", formatMoney(900000000), "₹900,000,000.00");

// 12. Decimals.
check("12. 1250.5 → 1,250.50", formatMoney(1250.5), "₹1,250.50");
check("12. 1.005 rounds half up to 1.01", formatMoney(1.005), "₹1.01");
check("12. 0.1 + 0.2 sums to 0.30", formatMoney(sumMoney(0.1, 0.2)), "₹0.30");
check("12. roundMoney(2.675) = 2.68", roundMoney(2.675), 2.68);
check("12. Invoice 100000.55 - 0 + 18000.10", sumMoney(100000.55, -0, 18000.1), 118000.65);

// 13. Money inputs: typing stays natural; stored values never contain commas.
check("13. Typing digits passes through", sanitizeAmountInput("10000"), "10000");
check("13. Partial decimal stays editable", sanitizeAmountInput("12."), "12.");
check("13. At most two decimals", sanitizeAmountInput("12.345"), "12.34");
check("13. Pasted formatted value is cleaned", sanitizeAmountInput("₹1,25,000.50"), "125000.50");
check("13. Second decimal point ignored", sanitizeAmountInput("1.2.3"), "1.23");
check("13. Letters ignored", sanitizeAmountInput("12a3"), "123");
check("13. Leading dot becomes 0.", sanitizeAmountInput(".5"), "0.5");
check("13. Minus dropped unless allowed", sanitizeAmountInput("-50"), "50");
check("13. Minus kept when allowed", sanitizeAmountInput("-50", { allowNegative: true }), "-50");
check("13. Empty field stays empty", sanitizeAmountInput(""), "");
check("13. parseAmount('10,000.00') = 10000", parseAmount("10,000.00"), 10000);
check("13. parseAmount('') = null", parseAmount(""), null);
check("13. parseAmount('12.') = 12", parseAmount("12."), 12);
check("13. Blur shows 10,000.00 for a typed 10000", formatAmount(parseAmount("10000")), "10,000.00");

// Chart axis labels stay short (axes only).
check("Axis: 150000 → ₹1.5L", formatAxisMoney(150000), "₹1.5L");
check("Axis: 25000 → ₹25k", formatAxisMoney(25000), "₹25k");
check("Axis: 20000000 → ₹2Cr", formatAxisMoney(20000000), "₹2Cr");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
