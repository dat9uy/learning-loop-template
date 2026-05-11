import { Link } from '@tanstack/react-router'
import { SearchBox } from '../components/SearchBox'
import { equityRoutePath } from './reference/equity'

export const indexRoutePath = '/'

export function IndexRoute() {
  return (
    <main>
      <h1>FastAPI Reference Build</h1>
      <p><Link to={equityRoutePath}>Equity list</Link></p>
      <SearchBox />
    </main>
  )
}
