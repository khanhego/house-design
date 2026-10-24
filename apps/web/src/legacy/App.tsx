import { useEffect, useState } from 'react'
import { houses } from './data/houses'
import { HouseList } from './components/HouseList'
import { Viewer } from './components/Viewer'

const readRoute = () => window.location.hash.match(/^#\/house\/([\w-]+)/)?.[1] ?? null

export const App = () => {
  const [houseId, setHouseId] = useState(readRoute)

  useEffect(() => {
    const onHash = () => setHouseId(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const house = houses.find((h) => h.id === houseId)
  if (!house) return <HouseList onOpen={(id) => (window.location.hash = `/house/${id}`)} />
  return <Viewer key={house.id} house={house} onBack={() => (window.location.hash = '/')} />
}
