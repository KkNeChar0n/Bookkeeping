import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/budget', label: '预算', ico: '📊' },
  { to: '/savings', label: '储蓄', ico: '🏦' },
  { to: '/', label: '记账', ico: '✏️', end: true, center: true },
  { to: '/fund', label: '基金', ico: '📈' },
  { to: '/summary', label: '统计', ico: '🧮' },
];

export function Layout() {
  return (
    <>
      <div className="app">
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `${isActive ? 'active' : ''}${t.center ? ' center' : ''}`
            }
          >
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
