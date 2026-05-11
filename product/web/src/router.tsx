import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { companyRoutePath, CompanyRoute, loadCompanyReference } from './routes/reference/company.$symbol'
import { equityRoutePath, EquityRoute, loadEquityReference } from './routes/reference/equity'
import { indexRoutePath, IndexRoute } from './routes'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: indexRoutePath,
  component: IndexRoute,
})

export const equityReferenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: equityRoutePath,
  loader: loadEquityReference,
  component: () => <EquityRoute data={equityReferenceRoute.useLoaderData()} />,
})

export const companyReferenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: companyRoutePath,
  loader: ({ params }) => loadCompanyReference(params.symbol),
  component: () => <CompanyRoute data={companyReferenceRoute.useLoaderData()} />,
})

export const referenceRoutes = rootRoute.addChildren([indexRoute, equityReferenceRoute, companyReferenceRoute])
export const router = createRouter({ routeTree: referenceRoutes })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
