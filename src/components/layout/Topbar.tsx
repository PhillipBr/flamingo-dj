export default function Topbar() {
  return (
    <header className="topbar">
      <div>
        <strong>DJ Library</strong>
      </div>

      <input
        type="search"
        placeholder="Search tracks..."
        aria-label="Search tracks"
      />
    </header>
  );
}