/**
 * 十进制归一化（计划 §4.4 第 1 步）。
 *
 * fail-closed：任何不合法输入（非法形状、超出币种 scale 的精度、溢出、非有限 number、
 * 不能精确落到 minor unit 的浮点）都抛 DecimalNormalizationError，绝不静默取整。
 * 公共合同金额为十进制字符串；bigint 换算只在本模块发生一次。
 */

export class DecimalNormalizationError extends Error {
  readonly name = "DecimalNormalizationError";
}

/** Prisma Decimal(20,2) 天花板：整数位数 + scale ≤ 20。 */
export const MAX_DECIMAL_TOTAL_DIGITS = 20;

/** 账簿事实金额（voucher debit/credit、reclass amount 等）的存储精度。 */
export const LEDGER_MONEY_SCALE = 2;

const CURRENCY_SCALES: Readonly<Record<string, number>> = {
  CNY: 2,
  CAD: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  TWD: 2,
  SGD: 2,
  AUD: 2,
  JPY: 0,
  KRW: 0,
};

export function currencyScale(currencyCode: string): number {
  const scale = CURRENCY_SCALES[currencyCode.toUpperCase()];
  if (scale === undefined) {
    throw new DecimalNormalizationError(`unsupported currency code: ${currencyCode}`);
  }
  return scale;
}

const PLAIN_DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;
const GROUPED_DECIMAL = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/**
 * 解析十进制字符串为带符号整数 minor units。接受严格千分位分组（"1,234.56"）。
 * 负零归一为 0n（bigint 无负零）。拒绝指数记法、非数字、超出 scale 的小数位和溢出。
 */
export function parseDecimalToMinorUnits(raw: string, scale: number): bigint {
  if (typeof raw !== "string") {
    throw new DecimalNormalizationError("decimal input must be a string");
  }
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_DECIMAL_TOTAL_DIGITS) {
    throw new DecimalNormalizationError(`invalid scale: ${scale}`);
  }
  const text = raw.trim();
  if (!text || (!PLAIN_DECIMAL.test(text) && !GROUPED_DECIMAL.test(text))) {
    throw new DecimalNormalizationError(`invalid decimal input: ${JSON.stringify(raw)}`);
  }
  const negative = text.startsWith("-");
  const body = text.replace(/^[+-]/, "").replace(/,/g, "");
  const [integerPart, fractionPart = ""] = body.split(".");
  if (fractionPart.length > scale) {
    throw new DecimalNormalizationError(
      `precision exceeds currency scale ${scale}: ${JSON.stringify(raw)}`,
    );
  }
  const significantInteger = integerPart.replace(/^0+(?=\d)/, "");
  if (significantInteger.length + scale > MAX_DECIMAL_TOTAL_DIGITS) {
    throw new DecimalNormalizationError(`decimal overflow: ${JSON.stringify(raw)}`);
  }
  const minorText = integerPart + fractionPart.padEnd(scale, "0");
  const magnitude = BigInt(minorText.replace(/^0+(?=\d)/, "") || "0");
  return negative ? -magnitude : magnitude;
}

/** 规范化为十进制字符串：符号仅在负值时出现，无千分位，无负零（0 → "0.00"）。 */
export function formatMinorUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const magnitude = (negative ? -value : value).toString().padStart(scale + 1, "0");
  if (scale === 0) return negative ? `-${magnitude}` : magnitude;
  const integerPart = magnitude.slice(0, -scale);
  const fractionPart = magnitude.slice(-scale);
  return `${negative ? "-" : ""}${integerPart}.${fractionPart}`;
}

/**
 * 浮点金额 → minor units。仅当值能精确落到 minor unit（容差覆盖 float64 表示误差，
 * 不覆盖真实的亚分小数）时接受；否则 fail closed。
 */
export function numberToMinorUnits(value: number, scale: number): bigint {
  if (!Number.isFinite(value)) {
    throw new DecimalNormalizationError(`non-finite money value: ${value}`);
  }
  const scaled = value * 10 ** scale;
  const rounded = Math.round(scaled);
  const tolerance = Math.max(1e-6, Math.abs(scaled) * 1e-14);
  if (Math.abs(scaled - rounded) > tolerance) {
    throw new DecimalNormalizationError(
      `money value ${value} is not an exact minor-unit amount at scale ${scale}`,
    );
  }
  if (!Number.isSafeInteger(rounded)) {
    throw new DecimalNormalizationError(`money value overflow: ${value}`);
  }
  return BigInt(rounded);
}

/** string/number/bigint/Decimal-like（Prisma Decimal）→ minor units；其他形状 fail closed。 */
export function decimalLikeToMinorUnits(value: unknown, scale: number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return parseDecimalToMinorUnits(value, scale);
  if (typeof value === "number") return numberToMinorUnits(value, scale);
  if (value && typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function") {
    return parseDecimalToMinorUnits(String(value), scale);
  }
  throw new DecimalNormalizationError(`unsupported money value: ${String(value)}`);
}

export function absMinor(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}
