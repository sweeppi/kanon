// Проверка товарных штрихкодов (чистые функции, без камеры и сборщика — удобно тестировать).

/** Контрольная цифра EAN-8, UPC-A (12), EAN-13 и GTIN-14: отсеивает неверно прочитанные коды. */
export function isValidEan(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Из результатов распознавания берём первый товарный код с верной контрольной цифрой. */
export function pickEan(texts: string[]): string | null {
  return texts.map((t) => t.trim()).find(isValidEan) ?? null;
}
