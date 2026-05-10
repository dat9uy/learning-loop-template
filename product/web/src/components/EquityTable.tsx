import type { DataFrameEnvelope, EquityRow } from '../lib/reference-client'

export function EquityTable({ data }: { data: DataFrameEnvelope<EquityRow> }) {
  return (
    <section aria-label="Reference equity list">
      <h1>Reference Equity List</h1>
      <table>
        <thead>
          <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={`${row.symbol ?? 'row'}-${index}`}>
              {data.columns.map((column) => <td key={column}>{String(row[column as keyof EquityRow] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
