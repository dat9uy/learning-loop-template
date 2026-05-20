export const companyRoutePath = '/reference/company/$symbol'
export const loadCompanyReference = (symbol: string) => ({ company: symbol })

export function CompanyRoute({ data }: { data: any }) {
  return <div>Company</div>
}
