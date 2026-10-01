/**
 * Thai 13-digit registration numbers — juristic persons and citizens alike — end in a mod-11
 * check digit over the first twelve, weighted 13 down to 2 (spec §5.5: "format and check digit").
 */
export function juristicIdCheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('A check digit needs exactly twelve digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
}

export function isValidJuristicId(id: string | null | undefined): boolean {
  if (!id || !/^\d{13}$/.test(id)) return false;
  return juristicIdCheckDigit(id.slice(0, 12)) === Number(id[12]);
}

/** A valid id from any twelve digits (fixtures and tests). */
export function withCheckDigit(first12: string): string {
  return first12 + juristicIdCheckDigit(first12);
}
