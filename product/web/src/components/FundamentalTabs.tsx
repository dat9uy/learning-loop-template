import * as React from 'react'
import type { FundamentalResponse } from '../lib/fundamental-client'
import { fetchIncomeStatement, fetchBalanceSheet, fetchCashFlow, fetchRatios } from '../lib/fundamental-client'
import { FundamentalTable } from './FundamentalTable'

type TabKey = 'income' | 'balance' | 'cashflow' | 'ratios'

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'ratios', label: 'Ratios' },
]

export function FundamentalTabs({ symbol }: { symbol: string }) {
  const [activeTab, setActiveTab] = React.useState<TabKey>('income')
  const [limit, setLimit] = React.useState(4)
  const [data, setData] = React.useState<FundamentalResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchers: Record<TabKey, () => Promise<FundamentalResponse>> = {
      income: () => fetchIncomeStatement(symbol, limit),
      balance: () => fetchBalanceSheet(symbol, limit),
      cashflow: () => fetchCashFlow(symbol, limit),
      ratios: () => fetchRatios(symbol),
    }

    fetchers[activeTab]()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [activeTab, symbol, limit])

  return (
    <div>
      <h1>Fundamental Data: {symbol}</h1>
      <div role="tablist" aria-label="Financial statements">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab !== 'ratios' && (
        <label>
          Periods:
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      <div id={`panel-${activeTab}`} role="tabpanel">
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {!loading && !error && data && (
          <FundamentalTable data={data} title={TAB_CONFIG.find((t) => t.key === activeTab)?.label ?? ''} />
        )}
      </div>
    </div>
  )
}
