import { useEffect, useState } from 'react';
import { fetchClaims } from './api.js';
import type { ClaimsDto } from './types.js';

const ICON: Record<string, string> = { succeeded: '✓', failed: '✗', attempted: '⚠' };

export function ClaimsPanel({ id }: { id: string }) {
  const [claims, setClaims] = useState<ClaimsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClaims(null);
    setError(null);
    fetchClaims(id).then(setClaims).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="state error" role="alert">Failed to load claims: {error}</p>;
  if (!claims) return <p className="state">Loading claims…</p>;

  const allSucceeded = claims.files.length > 0 && claims.files.every((f) => f.status === 'succeeded');

  return (
    <section className="panel">
      <p className="section-label">Claims vs. reality</p>
      {!claims.hooksPresent && (
        <p className="caution" role="status">
          ⚠ Hooks not installed for this session — edits shown are attempts; execution outcome is unknown.
        </p>
      )}
      {claims.files.length === 0 ? (
        <p className="claims-empty">No file edits were attempted in this session.</p>
      ) : (
        <ul className="claims">
          {claims.files.map((f) => (
            <li className="claim" key={f.path}>
              <span className={`status-led ${f.status}`} data-testid={`status-${f.path}`} title={f.status}>
                {ICON[f.status] ?? '?'}
              </span>
              <span className="path">{f.path}</span>
            </li>
          ))}
        </ul>
      )}
      {claims.hooksPresent && allSucceeded && <p className="claims-ok">Everything attempted was executed ✓</p>}
    </section>
  );
}
