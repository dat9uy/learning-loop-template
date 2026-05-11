import { Link } from '@tanstack/react-router'
import type { DataFrameEnvelope, EquityRow } from '../lib/reference-client'
import { companyRoutePath } from '../routes/reference/company.$symbol'

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
              {data.columns.map((column) => {
                const value = String(row[column as keyof EquityRow] ?? '')
                return (
                  <td key={column}>
                    {column === 'symbol' && row.symbol ? (
                      <Link to={companyRoutePath} params={{ symbol: row.symbol }}>{value}</Link>
                    ) : (
                      value
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
