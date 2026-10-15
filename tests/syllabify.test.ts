import { describe, expect, it } from 'vitest';
import { spellingChunks, syllabify } from '../src/lib/phonetics';

const split = (w: string, ipa: string) => {
  const c = spellingChunks(w, ipa);
  return c ? syllabify(c).join('·') : null;
};

describe('syllabify', () => {
  it('transferred', () => expect(split('transferred', 'tɹænsfˈɜːd')).toBe('trans·ferred'));
  it('letter', () => expect(split('letter', 'lˈɛɾɚ')).toBe('let·ter'));
  it('single syllable', () => expect(split('cat', 'kˈæt')).toBe('cat'));
});
