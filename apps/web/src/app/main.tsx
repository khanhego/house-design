import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../styles/tokens.css'
import './app.css'
import { ApiError } from '../lib/api.ts'
import { ForgotPage, Guard, LoginPage, SetPasswordPage } from './auth.tsx'
import { PortalLayout, StudioLayout } from './layout.tsx'
import { ToastHost } from './ui.tsx'
import { ClientDetailPage, ClientsPage, UsersPage } from './studio/Clients.tsx'
import { ProjectDetailPage, ProjectsPage } from './studio/Projects.tsx'
import { LibraryPage } from './studio/Library.tsx'

const Editor = lazy(() => import('./studio/editor/EditorPage.tsx').then((m) => ({ default: m.EditorPage })))
const Versions = lazy(() => import('./studio/Versions.tsx').then((m) => ({ default: m.VersionsPage })))
const PortalHome = lazy(() => import('./portal/PortalHome.tsx').then((m) => ({ default: m.PortalHome })))
const Review = lazy(() => import('./portal/Review.tsx').then((m) => ({ default: m.ReviewPage })))
const Leads = lazy(() => import('./portal/Leads.tsx').then((m) => ({ default: m.LeadsPage })))
const Stats = lazy(() => import('./portal/Stats.tsx').then((m) => ({ default: m.StatsPage })))

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404].includes(e.status)) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
})

const Loading = () => <div className="center-page"><div className="spinner" /></div>

const App = () => (
  <Suspense fallback={<Loading />}>
    <Routes>
      {(['studio', 'portal'] as const).map((area) => [
        <Route key={`${area}-login`} path={`/${area}/login`} element={<LoginPage area={area} />} />,
        <Route key={`${area}-forgot`} path={`/${area}/forgot`} element={<ForgotPage area={area} />} />,
        <Route key={`${area}-set`} path={`/${area}/set-password`} element={<SetPasswordPage area={area} />} />,
      ])}
      <Route path="/studio" element={<Navigate to="/studio/projects" replace />} />
      <Route path="/studio/projects" element={<Guard area="studio">{(me) => <StudioLayout me={me}><ProjectsPage me={me} /></StudioLayout>}</Guard>} />
      <Route path="/studio/projects/:id" element={<Guard area="studio">{(me) => <StudioLayout me={me}><ProjectDetailPage me={me} /></StudioLayout>}</Guard>} />
      <Route path="/studio/library" element={<Guard area="studio">{(me) => <StudioLayout me={me}><LibraryPage /></StudioLayout>}</Guard>} />
      <Route path="/studio/clients" element={<Guard area="studio" roles={['admin']}>{(me) => <StudioLayout me={me}><ClientsPage /></StudioLayout>}</Guard>} />
      <Route path="/studio/clients/:id" element={<Guard area="studio" roles={['admin']}>{(me) => <StudioLayout me={me}><ClientDetailPage /></StudioLayout>}</Guard>} />
      <Route path="/studio/users" element={<Guard area="studio" roles={['admin']}>{(me) => <StudioLayout me={me}><UsersPage /></StudioLayout>}</Guard>} />
      <Route path="/studio/houses/:id/edit" element={<Guard area="studio">{(me) => <Editor me={me} />}</Guard>} />
      <Route path="/studio/houses/:id/versions" element={<Guard area="studio">{(me) => <StudioLayout me={me}><Versions me={me} /></StudioLayout>}</Guard>} />
      <Route path="/studio/leads" element={<Guard area="studio" roles={['admin']}>{(me) => <StudioLayout me={me}><Leads me={me} /></StudioLayout>}</Guard>} />
      <Route path="/studio/stats" element={<Guard area="studio" roles={['admin']}>{(me) => <StudioLayout me={me}><Stats me={me} /></StudioLayout>}</Guard>} />

      <Route path="/portal" element={<Guard area="portal">{(me) => <PortalLayout me={me}><PortalHome me={me} /></PortalLayout>}</Guard>} />
      <Route path="/portal/review/:versionId" element={<Guard area="portal">{(me) => <Review me={me} />}</Guard>} />
      <Route path="/portal/leads" element={<Guard area="portal">{(me) => <PortalLayout me={me}><Leads me={me} /></PortalLayout>}</Guard>} />
      <Route path="/portal/stats" element={<Guard area="portal">{(me) => <PortalLayout me={me}><Stats me={me} /></PortalLayout>}</Guard>} />
      <Route path="*" element={<Navigate to="/studio/projects" replace />} />
    </Routes>
  </Suspense>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
        <ToastHost />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
