import test from 'node:test'
import assert from 'node:assert/strict'
import { anonymizeText } from '../src/lib/anonymize.js'

test('anonymizes direct identifiers and common protected signals', () => {
  const output = anonymizeText(
    'Ada Lovelace, ada@example.com, +234 803 123 4567, DOB 12/04/1998, female, age 42, Yoruba, wheelchair user, Benin City',
    {
      protectedValues: ['Yoruba', '42'],
      identityValues: ['Ada Lovelace', 'Benin City'],
    },
  )

  assert.doesNotMatch(output, /ada@example\.com|803 123 4567|12\/04\/1998|Yoruba|Benin City/i)
  assert.match(output, /redacted-(email|phone|date|gender|age|disability|protected-attribute|identity)/)
})

test('preserves job-relevant technical terms', () => {
  const output = anonymizeText('React, TypeScript, Python, AWS and project management')
  assert.equal(output, 'React, TypeScript, Python, AWS and project management')
})
