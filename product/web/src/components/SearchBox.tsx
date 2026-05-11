import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { fetchSearchSymbols, type DataFrameEnvelope, type EquityRow } from '../lib/reference-client'
import { companyRoutePath } from '../routes/reference/company.$symbol'

export function SearchBox() {
  const [query, setQuery] = React.useState('')
  const [data, setData] = React.useState<DataFrameEnvelope<EquityRow> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const requestId = React.useRef(0)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      requestId.current += 1
      setData(null)
      setError(null)
      setIsLoading(false)
      return
    }

    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setIsLoading(true)
    setError(null)
    try {
      const results = await fetchSearchSymbols(trimmed)
      if (currentRequestId === requestId.current) {
        setData(results)
      }
    } catch (searchError) {
      if (currentRequestId === requestId.current) {
        setError(searchError instanceof Error ? searchError.message : 'Reference search request failed')
        setData(null)
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setIsLoading(false)
      }
    }
  }

  return (
    <section aria-label="Reference symbol search">
      <h2>Symbol Search</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="reference-symbol-search">Symbol or organization</label>
        <input
          id="reference-symbol-search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <button type="submit" disabled={isLoading}>{isLoading ? 'Searching' : 'Search'}</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {data ? <SearchResults data={data} /> : null}
    </section>
  )
}

function SearchResults({ data }: { data: DataFrameEnvelope<EquityRow> }) {
  if (data.row_count === 0) return <p>No results</p>

  return (
    <table>
      <thead>
        <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
      </thead>
      <tbody>
        {data.rows.map((row, index) => (
          <tr key={`${row.symbol ?? 'result'}-${index}`}>
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
  )
}
