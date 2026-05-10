import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/fastapi-reference-response.json', import.meta.url), 'utf8'))
const routerSource = readFileSync(new URL('../src/router.tsx', import.meta.url), 'utf8')
const equityRouteSource = readFileSync(new URL('../src/routes/reference/equity.tsx', import.meta.url), 'utf8')
const companyRouteSource = readFileSync(new URL('../src/routes/reference/company.$symbol.tsx', import.meta.url), 'utf8')
const equityComponentSource = readFileSync(new URL('../src/components/EquityTable.tsx', import.meta.url), 'utf8')
const companyComponentSource = readFileSync(new URL('../src/components/CompanyDetail.tsx', import.meta.url), 'utf8')

test('equity route fixture exposes expected table headers', () => {
  assert.deepEqual(fixture.equity.columns, ['symbol', 'org_name'])
  assert.equal(fixture.equity.row_count, fixture.equity.rows.length)
})

test('company detail fixture exposes expected fields', () => {
  assert.deepEqual(fixture.company.columns, ['symbol', 'name', 'sector', 'profile', 'listing_date', 'issued_share'])
  assert.equal(fixture.company.row_count, fixture.company.rows.length)
})

test('reference app wires route views and render components', () => {
  assert.match(routerSource, /createRouter/)
  assert.match(routerSource, /RouterProvider/)
  assert.match(routerSource, /equityReferenceRoute/)
  assert.match(routerSource, /companyReferenceRoute/)
  assert.match(equityRouteSource, /loadEquityReference/)
  assert.match(companyRouteSource, /loadCompanyReference/)
  assert.match(equityComponentSource, /<table>/)
  assert.match(companyComponentSource, /<dl>/)
})

test('reference components render fixture-backed output', async () => {
  const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, logLevel: 'silent' })
  try {
    const { EquityTable } = await server.ssrLoadModule('/src/components/EquityTable.tsx')
    const { CompanyDetail } = await server.ssrLoadModule('/src/components/CompanyDetail.tsx')
    const equityHtml = renderToStaticMarkup(EquityTable({ data: fixture.equity }))
    const companyHtml = renderToStaticMarkup(CompanyDetail({ data: fixture.company }))

    assert.match(equityHtml, /<table>/)
    assert.match(equityHtml, /symbol/)
    assert.match(companyHtml, /<dl>/)
    assert.match(companyHtml, /listing_date/)
  } finally {
    await server.close()
  }
})
