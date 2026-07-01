export function normalizeFormulaDisplayText(formulaText: string, formulaByAlias = new Map<string, string>()) {
  return normalizeLimitFormulaDisplay(
    normalizeRsdFormulaDisplay(
      normalizeRdFormulaDisplay(normalizeAverageFormulaDisplay(formulaText.trim()), formulaByAlias),
      formulaByAlias,
    ),
    formulaByAlias,
  );
}

const FORMULA_REF = String.raw`[xypz]\d+`;
const FORMULA_NUMBER = String.raw`\d+(?:\.\d+)?`;

function normalizeAverageFormulaDisplay(formulaText: string) {
  const match = formulaText.match(/^\(?\s*([xypz]\d+(?:\s*\+\s*[xypz]\d+)+)\s*\)?\s*\/\s*(\d+)\s*$/i);
  if (!match) return formulaText;
  const refs = match[1].split("+").map((ref) => ref.trim().toLowerCase());
  return refs.length === Number(match[2]) ? `AVG(${refs.join(", ")})` : formulaText;
}

function normalizeRdFormulaDisplay(formulaText: string, formulaByAlias: Map<string, string>) {
  const direct = formulaText.match(/^ABS\s*\(\s*([xypz]\d+)\s*-\s*([xypz]\d+)\s*\)\s*\/\s*([xypz]\d+)\s*\*?\s*100\s*$/i);
  if (direct) {
    const [left, right, denominator] = direct.slice(1).map((ref) => ref.toLowerCase());
    const denominatorRefs = averageRefsForFormula(formulaByAlias.get(denominator) ?? "");
    return denominatorRefs?.length === 2 && sameRefPair(left, right, denominatorRefs[0], denominatorRefs[1]) ? `RD(${left}, ${right})` : formulaText;
  }

  const implicitAverage = formulaText.match(/^ABS\s*\(\s*([xypz]\d+)\s*-\s*([xypz]\d+)\s*\)\s*\/\s*\(?\s*\(?\s*([xypz]\d+)\s*\+\s*([xypz]\d+)\s*\)?\s*\/\s*2\s*\)?\s*\*?\s*100\s*$/i);
  if (!implicitAverage) return formulaText;
  const [left, right, avgLeft, avgRight] = implicitAverage.slice(1).map((ref) => ref.toLowerCase());
  return sameRefPair(left, right, avgLeft, avgRight) ? `RD(${left}, ${right})` : formulaText;
}

function normalizeRsdFormulaDisplay(formulaText: string, formulaByAlias: Map<string, string>) {
  const match = formulaText.match(new RegExp(String.raw`^SQRT\s*\(\s*\(?\s*(.*?)\s*\)?\s*\/\s*(\d+)\s*\)\s*\/\s*(${FORMULA_REF})\s*\*?\s*100\s*$`, "i"));
  if (!match) return formulaText;
  const mean = match[3].toLowerCase();
  const refs = standardDeviationRefs(match[1], mean, Number(match[2]), formulaByAlias);
  return refs ? `RSD(${refs.join(", ")})` : formulaText;
}

function normalizeLimitFormulaDisplay(formulaText: string, formulaByAlias: Map<string, string>) {
  const match = formulaText.match(new RegExp(String.raw`^(${FORMULA_REF})\s*([+-])\s*(${FORMULA_NUMBER})\s*\*\s*SQRT\s*\(\s*\(?\s*(.*?)\s*\)?\s*\/\s*(\d+)\s*\)\s*$`, "i"));
  if (!match) return formulaText;
  const mean = match[1].toLowerCase();
  const operator = match[2];
  const factor = match[3];
  const refs = standardDeviationRefs(match[4], mean, Number(match[5]), formulaByAlias);
  return refs ? `${mean} ${operator} ${factor} * SD(${refs.join(", ")})` : formulaText;
}

function averageRefsForFormula(formulaText: string) {
  const normalized = normalizeAverageFormulaDisplay(formulaText.trim());
  const match = normalized.match(/^AVG\s*\(\s*([xypz]\d+(?:\s*,\s*[xypz]\d+)*)\s*\)$/i);
  return match ? match[1].split(",").map((ref) => ref.trim().toLowerCase()) : null;
}

function sameRefPair(left: string, right: string, otherLeft: string, otherRight: string) {
  return (left === otherLeft && right === otherRight) || (left === otherRight && right === otherLeft);
}

function standardDeviationRefs(sumText: string, mean: string, denominator: number, formulaByAlias: Map<string, string>) {
  const refs = deviationRefs(sumText, mean);
  if (!refs || refs.length < 2 || denominator !== refs.length - 1) return null;
  const meanRefs = averageRefsForFormula(formulaByAlias.get(mean) ?? "");
  return meanRefs && sameRefSet(refs, meanRefs) ? refs : null;
}

function deviationRefs(sumText: string, mean: string) {
  const terms = stripOuterParens(sumText).split(/\s*\+\s*/).map((term) => stripOuterParens(term.trim())).filter(Boolean);
  if (!terms.length) return null;
  const refs: string[] = [];
  for (const term of terms) {
    const match = term.match(new RegExp(String.raw`^\(?\s*(${FORMULA_REF})\s*-\s*(${FORMULA_REF})\s*\)?\s*\^\s*2$`, "i"));
    if (!match || match[2].toLowerCase() !== mean) return null;
    refs.push(match[1].toLowerCase());
  }
  return refs;
}

function sameRefSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

function stripOuterParens(value: string) {
  let text = value.trim();
  while (text.startsWith("(") && text.endsWith(")") && wrapsWholeExpression(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function wrapsWholeExpression(value: string) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0;
}
