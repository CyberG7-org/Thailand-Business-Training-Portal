/** Use the document's printed nominal value, or derive it when only capital and shares are given. */
export function valuePerShare(
  printed: number | null,
  registeredCapital: number | null,
  totalShares: number | null,
): number | null {
  if (printed !== null && Number.isFinite(printed) && printed > 0) return printed;
  if (
    registeredCapital === null ||
    !Number.isFinite(registeredCapital) ||
    registeredCapital <= 0 ||
    totalShares === null ||
    !Number.isSafeInteger(totalShares) ||
    totalShares <= 0
  )
    return null;

  // Baht amounts have two decimal places. Do not display a rounded value unless it
  // multiplies back to the stated capital (within floating-point tolerance).
  const satang = Math.round((registeredCapital / totalShares) * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0) return null;
  const value = satang / 100;
  return Math.abs(value * totalShares - registeredCapital) <= 1e-6 ? value : null;
}
