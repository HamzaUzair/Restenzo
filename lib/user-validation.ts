/**
 * Shared user field validation for staff/admin creation and updates.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONLY_DIGITS_AND_SPACES_REGEX = /^[\d\s]+$/;

export function validateEmailUsername(
  value: string,
  fieldLabel = "Username email"
): string | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return `${fieldLabel} is required.`;
  }

  if (!trimmed.includes("@")) {
    return `${fieldLabel} must include @.`;
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return fieldLabel === "Username email"
      ? "Please enter a valid email address for the username."
      : "Please enter a valid email address.";
  }

  return null;
}

export function validateNameWithLetters(
  value: string,
  fieldLabel = "Full name"
): string | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return `${fieldLabel} is required.`;
  }

  const hasLetter = /\p{L}/u.test(trimmed);
  const onlyDigitsSpaces = ONLY_DIGITS_AND_SPACES_REGEX.test(trimmed);

  if (!hasLetter || onlyDigitsSpaces) {
    return `${fieldLabel} must include at least one letter. Numbers alone are not allowed.`;
  }

  return null;
}

