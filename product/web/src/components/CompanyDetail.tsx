import type { CompanyInfoRow, DataFrameEnvelope } from '../lib/reference-client'

export function CompanyDetail({ data }: { data: DataFrameEnvelope<CompanyInfoRow> }) {
  const detail = data.rows[0] ?? {}
  return (
    <section aria-label="Reference company detail">
      <h1>Reference Company Detail</h1>
      <dl>
        {data.columns.map((column) => (
          <div key={column}>
            <dt>{column}</dt>
            <dd>{String(detail[column as keyof CompanyInfoRow] ?? '')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
