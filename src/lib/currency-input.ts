/** Parse rupees exactly; never round binary floating point into ledger amounts. */
export function rupeesToPaise(value: string): string {
  const match = /^(0|[1-9]\d{0,15})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match)
    throw new Error("Enter a rupee amount with up to two decimal places.");
  const paise =
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (paise > BigInt("9223372036854775807"))
    throw new Error("Amount exceeds the supported limit.");
  return paise.toString();
}
