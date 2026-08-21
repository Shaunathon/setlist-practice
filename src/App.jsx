import { Navigate, Route, Routes } from 'react-router-dom'
import Shows from './pages/Shows'
import ShowPage from './pages/ShowPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shows />} />
      <Route path="/show/:id" element={<ShowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
