export function normalizeFormulaDisplayText(formulaText: string, formulaByAlias = new Map<string, string>()) {
  return normalizeRdFormulaDisplay(normalizeAverageFormulaDisplay(formulaText.trim()), formulaByAlias);
}

function normalizeAverageFormulaDisplay(formulaText: string) {
  const match = formulaText.match(/^\(?\s*(x\d+(?:\s*\+\s*x\d+)+)\s*\)?\s*\/\s*(\d+)\s*$/i);
  if (!match) return formulaText;
  const refs = match[1].split("+").map((ref) => ref.trim().toLowerCase());
  return refs.length === Number(match[2]) ? `AVG(${refs.join(", ")})` : formulaText;
}

function normalizeRdFormulaDisplay(formulaText: string, formulaByAlias: Map<string, string>) {
  const direct = formulaText.match(/^ABS\s*\(\s*(x\d+)\s*-\s*(x\d+)\s*\)\s*\/\s*([xy]\d+)\s*\*?\s*100\s*$/i);
  if (direct) {
    const [left, right, denominator] = direct.slice(1).map((ref) => ref.toLowerCase());
    const denominatorRefs = averageRefsForFormula(formulaByAlias.get(denominator) ?? "");
    return denominatorRefs && sameRefPair(left, right, denominatorRefs[0], denominatorRefs[1]) ? `RD(${left}, ${right})` : formulaText;
  }

  const implicitAverage = formulaText.match(/^ABS\s*\(\s*(x\d+)\s*-\s*(x\d+)\s*\)\s*\/\s*\(?\s*\(?\s*(x\d+)\s*\+\s*(x\d+)\s*\)?\s*\/\s*2\s*\)?\s*\*?\s*100\s*$/i);
  if (!implicitAverage) return formulaText;
  const [left, right, avgLeft, avgRight] = implicitAverage.slice(1).map((ref) => ref.toLowerCase());
  return sameRefPair(left, right, avgLeft, avgRight) ? `RD(${left}, ${right})` : formulaText;
}

function averageRefsForFormula(formulaText: string) {
  const normalized = normalizeAverageFormulaDisplay(formulaText.trim());
  const match = normalized.match(/^AVG\s*\(\s*(x\d+)\s*,\s*(x\d+)\s*\)$/i);
  return match ? [match[1].toLowerCase(), match[2].toLowerCase()] as const : null;
}

function sameRefPair(left: string, right: string, otherLeft: string, otherRight: string) {
  return (left === otherLeft && right === otherRight) || (left === otherRight && right === otherLeft);
}
