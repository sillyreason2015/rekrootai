import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import TourOverlay from '../shared/TourOverlay'

export default function Layout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {/* doodle-main-bg handles both light and dark — no bg-background override needed */}
        <main className="doodle-main-bg flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <TourOverlay />
    </div>
  )
}
