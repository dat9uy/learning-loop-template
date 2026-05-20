import type { FundamentalResponse } from '../lib/fundamental-client'

export function FundamentalTable({ data, title }: { data: FundamentalResponse; title: string }) {
  if (data.row_count === 0) {
    return (
      <section aria-label={title}>
        <p>No data available.</p>
      </section>
    )
  }

  return (
    <section aria-label={title}>
      <table>
        <thead>
          <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={`row-${index}`}>
              {data.columns.map((column) => (
                <td key={column}>{String(row[column] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
