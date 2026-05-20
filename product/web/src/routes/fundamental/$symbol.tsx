import { FundamentalTabs } from '../../components/FundamentalTabs'

export const fundamentalRoutePath = '/fundamental/$symbol'

export function FundamentalRoute({ symbol }: { symbol: string }) {
  return <FundamentalTabs symbol={symbol} />
}
