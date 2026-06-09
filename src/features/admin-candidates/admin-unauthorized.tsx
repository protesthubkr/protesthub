export function AdminUnauthorized() {
  return (
    <main className="admin-shell">
      <section className="admin-empty">
        <p className="admin-kicker">관리자 접근 필요</p>
        <h1>검수 화면을 열 수 없습니다</h1>
        <p>
          URL에 `?secret=INGEST_SECRET`을 붙여 접근하세요. 로컬 MVP 보호
          방식이며, 배포 전에는 별도 관리자 인증으로 바꾸는 것을 전제로 합니다.
        </p>
      </section>
    </main>
  );
}
