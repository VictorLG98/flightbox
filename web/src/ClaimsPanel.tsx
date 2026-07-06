import { useEffect, useState } from 'react';
import { fetchClaims } from './api.js';
import type { ClaimsDto } from './types.js';

const ICON: Record<string, string> = { succeeded: '✓', failed: '✗', attempted: '⚠' };

export function ClaimsPanel({ id }: { id: string }) {
  const [claims, setClaims] = useState<ClaimsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClaims(null);
    fetchClaims(id).then(setClaims).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p role="alert">Failed to load claims: {error}</p>;
  if (!claims) return <p>Loading claims…</p>;

  const allSucceeded = claims.files.length > 0 && claims.files.every((f) => f.status === 'succeeded');

  return (
    <section>
      <h3>Claims vs. reality</h3>
      {!claims.hooksPresent && (
        <p role="note">⚠ Hooks not installed for this session — edits shown are attempts; execution outcome is unknown.</p>
      )}
      {claims.files.length === 0 ? (
        <p>No file edits were attempted in this session.</p>
      ) : (
        <ul>
          {claims.files.map((f) => (
            <li key={f.path}>
              <span data-testid={`status-${f.path}`} title={f.status}>{ICON[f.status] ?? '?'}</span>{' '}
              <code>{f.path}</code>
            </li>
          ))}
        </ul>
      )}
      {claims.hooksPresent && allSucceeded && <p>Everything attempted was executed ✓</p>}
    </section>
  );
}
