import { EquityTable } from '../../components/EquityTable'
import { fetchEquityList } from '../../lib/reference-client'

export const equityRoutePath = '/reference/equity'
export const loadEquityReference = () => fetchEquityList()

export function EquityRoute({ data }: { data: Awaited<ReturnType<typeof loadEquityReference>> }) {
  return <EquityTable data={data} />
}
