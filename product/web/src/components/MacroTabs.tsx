import * as React from 'react'
import type { MacroResponse } from '../lib/macro-client'
import {
  fetchEconomyGdp,
  fetchCurrencyExchangeRate,
  fetchCommodityGold,
} from '../lib/macro-client'
import { MacroTable } from './MacroTable'

type Tab = 'economy' | 'currency' | 'commodity'

const TAB_CONFIG: { key: Tab; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'currency', label: 'Currency' },
  { key: 'commodity', label: 'Commodity' },
]

const FETCHERS: Record<Tab, () => Promise<MacroResponse>> = {
  economy: () => fetchEconomyGdp({ period: 'quarter', length: 4 }),
  currency: () => fetchCurrencyExchangeRate({ period: 'day', length: 7 }),
  commodity: () => fetchCommodityGold({ market: 'VN', length: 7 }),
}

export function MacroTabs() {
  const [activeTab, setActiveTab] = React.useState<Tab>('economy')
  const [data, setData] = React.useState<MacroResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    FETCHERS[activeTab]()
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
  }, [activeTab])

  return (
    <div>
      <h1>Macro Data</h1>
      <div role="tablist" aria-label="Macro domains">
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
      <div id={`panel-${activeTab}`} role="tabpanel">
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {!loading && !error && data && (
          <MacroTable data={data} title={TAB_CONFIG.find((t) => t.key === activeTab)?.label ?? ''} />
        )}
      </div>
    </div>
  )
}
