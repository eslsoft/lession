import React, { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Library, Download, Settings } from 'lucide-react'
import { cn } from '../lib/utils'
import { ScrollArea } from '../components/ui/scroll-area'
import { useConfigStore } from '../stores/configStore'
import SetupDialog from '../pages/Setup'

const navItems = [
  { to: '/series', icon: Library, label: 'Series' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
]

export function MainLayout() {
  const { config } = useConfigStore()
  const [settingsOpen, setSettingsOpen] = useState(!config)

  return (
    <div className="flex h-screen flex-col">
      {/* Titlebar row — pure drag region for traffic lights */}
      <div className="drag-region h-10 flex-shrink-0" />

      {/* Body row — sidebar left, white content right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar nav */}
        <aside className="no-drag flex w-56 flex-col">
          {/* Logo above nav items */}
          <div className="px-4 pb-2 pt-1 text-base font-semibold">Lession</div>

          <nav className="flex-1 space-y-1 px-2 py-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Settings button at bottom */}
          <div className="border-t border-border p-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
        </aside>

        {/* Main content — white panel with margins on right/bottom, all corners rounded */}
        <main className="mb-2 mr-2 flex-1 overflow-hidden rounded-xl bg-white">
          <ScrollArea className="h-full">
            <div className="p-6">
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      </div>

      <SetupDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
