import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { companyRoutePath, CompanyRoute, loadCompanyReference } from './routes/reference/company.$symbol'
import { equityRoutePath, EquityRoute, loadEquityReference } from './routes/reference/equity'
import { indexRoutePath, IndexRoute } from './routes/index'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: indexRoutePath,
  component: IndexRoute,
})

const equityReferenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: equityRoutePath,
  loader: loadEquityReference,
  component: () => <EquityRoute data={equityReferenceRoute.useLoaderData()} />,
})

const companyReferenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: companyRoutePath,
  loader: ({ params }) => loadCompanyReference(params.symbol),
  component: () => <CompanyRoute data={companyReferenceRoute.useLoaderData()} />,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, equityReferenceRoute, companyReferenceRoute]),
})
