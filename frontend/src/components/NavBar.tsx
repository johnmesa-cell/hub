function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function NavBar() {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/')}>
        Hub
      </button>
      <nav className="topbar-actions">
        <button className="ghost" onClick={() => navigate('/login')}>Admin</button>
      </nav>
    </header>
  );
}
