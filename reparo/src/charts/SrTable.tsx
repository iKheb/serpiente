import s from './Chart.module.css';

export interface SrTableProps {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

/** Tabla visualmente oculta con los datos del gráfico (equivalente accesible). */
export function SrTable({ caption, columns, rows }: SrTableProps) {
  return (
    <table className={s.srOnly}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
