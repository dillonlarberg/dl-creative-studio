import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLI_STUDIO_USERS } from '../allowlist';

function extractEmailsFromRules(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf8');
  const matches = content.match(/'([^']+@pmg\.com)'/g) ?? [];
  return new Set(matches.map((m) => m.replace(/^'|'$/g, '')));
}

describe('allowlist drift detection', () => {
  it('firestore.rules and functions allowlist contain identical email sets', () => {
    const fromRules = extractEmailsFromRules(resolve('firestore.rules'));
    const fromTs = ALLI_STUDIO_USERS;
    expect([...fromRules].sort()).toEqual([...fromTs].sort());
  });

  it('storage.rules and functions allowlist contain identical email sets', () => {
    const fromRules = extractEmailsFromRules(resolve('storage.rules'));
    const fromTs = ALLI_STUDIO_USERS;
    expect([...fromRules].sort()).toEqual([...fromTs].sort());
  });
});
