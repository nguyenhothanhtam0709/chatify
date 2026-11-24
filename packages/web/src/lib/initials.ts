const INITIALS_LENGTH = 2;

/** The upper-cased first letters of a name, for an avatar fallback. */
export function initials(name: string): string {
  return name.slice(0, INITIALS_LENGTH).toUpperCase();
}
