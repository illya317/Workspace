const CN_ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CN_ID_CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

export function normalizePhoneValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/[\s-]+/g, "");
}

export function formatPhoneNumber(value: unknown) {
  const normalized = normalizePhoneValue(value);
  if (!normalized) return "";
  if (/^1\d{10}$/.test(normalized)) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 7)} ${normalized.slice(7)}`;
  }
  return normalized;
}

export function normalizeChineseIdNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toUpperCase().replace(/\s+/g, "");
  return text || null;
}

function isValidBirthDateCode(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function calculateChineseIdCheckCode(first17Digits: string) {
  if (!/^\d{17}$/.test(first17Digits)) return null;
  const sum = first17Digits
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * CN_ID_WEIGHTS[index], 0);
  return CN_ID_CHECK_CODES[sum % 11];
}

export function validateChineseIdNumber(value: unknown) {
  const normalized = normalizeChineseIdNumber(value);
  if (!normalized) return { ok: true as const, value: null };
  if (!/^\d{17}[\dX]$/.test(normalized)) {
    return { ok: false as const, error: "身份证号必须为 18 位，前 17 位为数字，最后一位为数字或 X。" };
  }
  if (!isValidBirthDateCode(normalized.slice(6, 14))) {
    return { ok: false as const, error: "身份证号中的出生日期无效。" };
  }
  const expected = calculateChineseIdCheckCode(normalized.slice(0, 17));
  if (expected !== normalized[17]) {
    return { ok: false as const, error: `身份证号校验码不正确，应为 ${expected}。` };
  }
  return { ok: true as const, value: normalized };
}
