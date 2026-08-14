export function normalizeEvidence(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function verifyCandidateEvidence(source: string, excerpt: string) {
  const normalizedSource = normalizeEvidence(source);
  const normalizedExcerpt = normalizeEvidence(excerpt);

  return (
    normalizedExcerpt.length >= 12 &&
    normalizedSource.includes(normalizedExcerpt)
  );
}
