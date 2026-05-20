export type DataFrameEnvelope<T> = {
  columns: string[]
  rows: T[]
  row_count: number
}

export type FundamentalRow = Record<string, string | number | null>
export type FundamentalResponse = DataFrameEnvelope<FundamentalRow>

const apiBaseUrl = import.meta.env.VITE_REFERENCE_API_BASE_URL ?? 'http://localhost:8000'

export async function fetchIncomeStatement(symbol: string, limit: number = 4): Promise<FundamentalResponse> {
  const response = await fetch(`${apiBaseUrl}/fundamental/income/${encodeURIComponent(symbol)}?limit=${limit}`)
  if (!response.ok) throw new Error(`Fundamental income request failed: ${response.status}`)
  return response.json()
}

export async function fetchBalanceSheet(symbol: string, limit: number = 4): Promise<FundamentalResponse> {
  const response = await fetch(`${apiBaseUrl}/fundamental/balance/${encodeURIComponent(symbol)}?limit=${limit}`)
  if (!response.ok) throw new Error(`Fundamental balance request failed: ${response.status}`)
  return response.json()
}

export async function fetchCashFlow(symbol: string, limit: number = 4): Promise<FundamentalResponse> {
  const response = await fetch(`${apiBaseUrl}/fundamental/cashflow/${encodeURIComponent(symbol)}?limit=${limit}`)
  if (!response.ok) throw new Error(`Fundamental cash flow request failed: ${response.status}`)
  return response.json()
}

export async function fetchRatios(symbol: string): Promise<FundamentalResponse> {
  const response = await fetch(`${apiBaseUrl}/fundamental/ratios/${encodeURIComponent(symbol)}`)
  if (!response.ok) throw new Error(`Fundamental ratios request failed: ${response.status}`)
  return response.json()
}
