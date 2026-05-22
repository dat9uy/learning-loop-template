export type DataFrameEnvelope<T> = {
  columns: string[]
  rows: T[]
  row_count: number
}

export type MacroRow = Record<string, string | number | null>
export type MacroResponse = DataFrameEnvelope<MacroRow>

const apiBaseUrl = import.meta.env.VITE_REFERENCE_API_BASE_URL ?? 'http://localhost:8000'

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

// Economy
export async function fetchEconomyGdp(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/gdp${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro GDP request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyCpi(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/cpi${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro CPI request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyIndustryProd(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/industry-prod${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro industry production request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyImportExport(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/import-export${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro import-export request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyRetail(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/retail${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro retail request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyFdi(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/fdi${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro FDI request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyMoneySupply(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/money-supply${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro money supply request failed: ${response.status}`)
  return response.json()
}

export async function fetchEconomyPopulationLabor(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/economy/population-labor${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro population-labor request failed: ${response.status}`)
  return response.json()
}

// Currency
export async function fetchCurrencyExchangeRate(params?: { start?: string; end?: string; period?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/currency/exchange-rate${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro exchange rate request failed: ${response.status}`)
  return response.json()
}

export async function fetchCurrencyInterestRate(params?: { start?: string; end?: string; period?: string; length?: number; format?: string }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/currency/interest-rate${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro interest rate request failed: ${response.status}`)
  return response.json()
}

// Commodity
export async function fetchCommodityGold(params?: { market?: string; start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/gold${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro gold request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityGas(params?: { market?: string; start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/gas${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro gas request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityOilCrude(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/oil-crude${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro oil-crude request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityCoke(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/coke${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro coke request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommoditySteel(params?: { market?: string; start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/steel${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro steel request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityIronOre(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/iron-ore${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro iron-ore request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityFertilizerUre(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/fertilizer-ure${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro fertilizer-ure request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommoditySoybean(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/soybean${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro soybean request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityCorn(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/corn${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro corn request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommoditySugar(params?: { start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/sugar${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro sugar request failed: ${response.status}`)
  return response.json()
}

export async function fetchCommodityPork(params?: { market?: string; start?: string; end?: string; length?: number }): Promise<MacroResponse> {
  const response = await fetch(`${apiBaseUrl}/macro/commodity/pork${buildQuery(params ?? {})}`)
  if (!response.ok) throw new Error(`Macro pork request failed: ${response.status}`)
  return response.json()
}
