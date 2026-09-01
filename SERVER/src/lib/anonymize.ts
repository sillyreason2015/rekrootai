/**
 * Redacts direct identifiers and protected-attribute signals before text is
 * sent to a scorer or an external AI provider. Declared candidate values are
 * passed in from the isolated ProtectedAttribute collection by the route.
 */
export type AnonymizationContext = {
  protectedValues?: Array<string | undefined>
  identityValues?: Array<string | undefined>
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redactValues(input: string, values: Array<string | undefined>, replacement: string) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= 2))
    .sort((a, b) => b.length - a.length)
    .reduce((text, value) => text.replace(new RegExp(escapeRegExp(value), 'gi'), replacement), input)
}

export function anonymizeText(input: string, context: AnonymizationContext = {}) {
  let masked = input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(\+?\d[\d\s\-()]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[redacted-date]')
    .replace(/\b(?:date of birth|dob|born)\s*[:\-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, '[redacted-date-of-birth]')
    .replace(/\b(?:age\s*[:\-]?\s*\d{1,3}|\d{1,3}\s*(?:years?\s*old|yo))\b/gi, '[redacted-age]')
    .replace(/\b(male|female|man|woman|boy|girl|he|she|his|her|him)\b/gi, '[redacted-gender]')
    .replace(/\b(disabled|disability|wheelchair|blind|deaf|autistic|autism|dyslexic|dyslexia)\b/gi, '[redacted-disability]')

  masked = redactValues(masked, context.protectedValues ?? [], '[redacted-protected-attribute]')
  return redactValues(masked, context.identityValues ?? [], '[redacted-identity]')
}
