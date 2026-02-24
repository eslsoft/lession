import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useConfigStore } from './stores/configStore'
import { MainLayout } from './layouts/MainLayout'
import DownloadsPage from './pages/Downloads'
import SeriesListPage from './pages/SeriesView'
import SeriesDetailPage from './pages/SeriesView/SeriesDetail'
import EpisodeDetailPage from './pages/EpisodeDetail'
import SplittingEditorPage from './pages/SplittingEditor'

export default function App() {
  const { config, initialized, fetchConfig } = useConfigStore()

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/series" element={<SeriesListPage />} />
          <Route path="/series/:id" element={<SeriesDetailPage />} />
          <Route path="/series/:seriesId/episodes/:episodeId" element={<EpisodeDetailPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/split" element={<SplittingEditorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/series" replace />} />
      </Routes>
    </HashRouter>
  )
}
