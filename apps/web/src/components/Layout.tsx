import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: '记账', ico: '✏️', end: true },
  { to: '/budget', label: '预算', ico: '📊' },
  { to: '/savings', label: '储蓄', ico: '🏦' },
  { to: '/summary', label: '统计', ico: '📈' },
  { to: '/cards', label: '卡片', ico: '💳' },
];

export function Layout() {
  return (
    <>
      <div className="app">
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
