/**
 * Shared validation for branch text fields used by both client and server.
 *
 * Rule:
 * - required after trim
 * - must contain at least one alphabetic character
 * - digits-only values (with optional spaces) are not allowed
 */

const HAS_LETTER_REGEX = /[A-Za-z]/;
const ONLY_DIGITS_AND_SPACES_REGEX = /^[\d\s]+$/;

export function validateBranchTextField(
  value: string | null | undefined,
  requiredMessage: string
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return requiredMessage;

  const hasLetter = HAS_LETTER_REGEX.test(trimmed);
  const isOnlyDigitsAndSpaces = ONLY_DIGITS_AND_SPACES_REGEX.test(trimmed);
  if (!hasLetter || isOnlyDigitsAndSpaces) {
    return "Please include at least one letter. Numbers alone are not allowed.";
  }

  return null;
}

