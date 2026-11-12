import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router';
import { logout, session } from './api';
import Login from './pages/Login';
import Overview from './pages/Overview';
import EquipmentPage from './pages/Equipment';
import SectorsPage from './pages/Sectors';
import { OpenTicket, TrackTicket } from './pages/Public';
import { TicketDetail, TicketList } from './pages/Tickets';
import Report from './pages/Report';
import Users from './pages/Users';
import './index.css';

function Layout() {
  const s = session();
  if (!s) return <Navigate to="/login" replace />;
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex h-11 items-center text-[15px] transition ${isActive ? 'text-white before:mr-2.5 before:h-0.5 before:w-3.5 before:bg-gold' : 'hover:text-white'}`;
  return (
    <div className="min-h-screen bg-white font-sans text-ink md:grid md:grid-cols-[220px_1fr] print:block">
      <aside className="flex flex-wrap print:hidden items-center gap-x-6 bg-ink px-5 py-3 text-[#9a9a9a] md:sticky md:top-0 md:h-screen md:flex-col md:flex-nowrap md:items-stretch md:py-6">
        <b className="text-lg font-semibold text-white md:mb-6">TI Prefeitura</b>
        <nav className="flex gap-5 md:flex-col md:gap-0" aria-label="Navegação principal">
          <NavLink to="/" end className={link}>Visão geral</NavLink>
          {s.user.role === 'TECNICO' && <NavLink to="/chamados" className={link}>Chamados</NavLink>}
          <NavLink to="/equipamentos" className={link}>Equipamentos</NavLink>
          <NavLink to="/setores" className={link}>Setores</NavLink>
          {s.user.role === 'TECNICO' && <NavLink to="/usuarios" className={link}>Usuários</NavLink>}
        </nav>
        <div className="ml-auto text-sm md:ml-0 md:mt-auto">
          <p className="hidden text-white md:block">{s.user.name}</p>
          <button onClick={logout} className="h-11 underline-offset-4 hover:text-white hover:underline">Sair</button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-9 print:p-0">
        <Outlet />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/abrir-chamado" element={<OpenTicket />} />
        <Route path="/acompanhar/:protocol?" element={<TrackTicket />} />
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="equipamentos" element={<EquipmentPage />} />
          <Route path="setores" element={<SectorsPage />} />
          <Route path="chamados" element={<TicketList />} />
          <Route path="chamados/:id" element={<TicketDetail />} />
          <Route path="setores/:id/relatorio" element={<Report />} />
          <Route path="usuarios" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
