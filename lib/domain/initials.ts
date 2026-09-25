/**
 * The two-character avatar in the shell header. Combining marks (Thai vowels and tone marks,
 * accents) stay with the letter they sit on, so a mark is never shown on its own. Without a
 * display name the login id is used, upper-cased as it is displayed.
 */
export function initialsOf(displayName: string | null | undefined, loginId = ''): string {
  const source = displayName?.trim() || loginId.toUpperCase();
  const graphemes: string[] = [];
  for (const ch of source) {
    if (/\p{M}/u.test(ch) && graphemes.length) graphemes[graphemes.length - 1] += ch;
    else graphemes.push(ch);
    if (graphemes.length > 2) break;
  }
  return graphemes.slice(0, 2).join('');
}
