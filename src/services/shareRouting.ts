const SHARE_HASH_PATTERN = /^#\/share\/([A-Za-z0-9_-]{1,64})$/;

export function parseShareHash(hash: string = window.location.hash): { shareId: string } | null {
  const match = SHARE_HASH_PATTERN.exec(hash);
  if (!match) return null;
  return { shareId: match[1] };
}
