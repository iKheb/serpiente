import { splitMatches } from './utils';

export interface HighlightProps {
  text: string;
  query: string;
  /** Clase del fragmento resaltado (<mark>). */
  className?: string;
}

/** Resalta las coincidencias de `query` en `text` (sin distinguir acentos). */
export function Highlight({ text, query, className }: HighlightProps) {
  const parts = splitMatches(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className={className}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
