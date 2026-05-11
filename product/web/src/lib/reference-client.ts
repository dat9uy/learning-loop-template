export type DataFrameEnvelope<T> = {
  columns: string[]
  rows: T[]
  row_count: number
}

export type EquityRow = { symbol?: string; org_name?: string }
export type CompanyInfoRow = { symbol?: string; name?: string; sector?: string; profile?: string; listing_date?: string; issued_share?: number | string }

const apiBaseUrl = import.meta.env.VITE_REFERENCE_API_BASE_URL ?? 'http://localhost:8000'

export async function fetchEquityList(): Promise<DataFrameEnvelope<EquityRow>> {
  const response = await fetch(`${apiBaseUrl}/reference/equity`)
  if (!response.ok) throw new Error(`Reference equity request failed: ${response.status}`)
  return response.json()
}

export async function fetchCompanyInfo(symbol: string): Promise<DataFrameEnvelope<CompanyInfoRow>> {
  const response = await fetch(`${apiBaseUrl}/reference/company/${encodeURIComponent(symbol)}`)
  if (!response.ok) throw new Error(`Reference company request failed: ${response.status}`)
  return response.json()
}

export async function fetchSearchSymbols(q: string): Promise<DataFrameEnvelope<EquityRow>> {
  const response = await fetch(`${apiBaseUrl}/reference/search?q=${encodeURIComponent(q)}`)
  if (!response.ok) throw new Error(`Reference search request failed: ${response.status}`)
  return response.json()
}
