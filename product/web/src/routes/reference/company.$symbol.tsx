import { CompanyDetail } from '../../components/CompanyDetail'
import { fetchCompanyInfo } from '../../lib/reference-client'

export const companyRoutePath = '/reference/company/$symbol'
export const loadCompanyReference = (symbol: string) => fetchCompanyInfo(symbol)

export function CompanyRoute({ data }: { data: Awaited<ReturnType<typeof loadCompanyReference>> }) {
  return <CompanyDetail data={data} />
}
