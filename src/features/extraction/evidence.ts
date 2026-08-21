export function normalizeForMatching(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\s\u0085]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function unicodeCodePointLength(value: string) {
  return Array.from(value).length;
}

export function normalizeEvidence(value: string) {
  return normalizeForMatching(value);
}

export function verifyCandidateEvidence(source: string, excerpt: string) {
  const normalizedSource = normalizeEvidence(source);
  const normalizedExcerpt = normalizeEvidence(excerpt);

  return (
    unicodeCodePointLength(normalizedExcerpt) >= 12 &&
    normalizedSource.includes(normalizedExcerpt)
  );
}
