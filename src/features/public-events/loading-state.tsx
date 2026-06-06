export function LoadingState() {
  return (
    <div className="loading-state" aria-live="polite" aria-busy="true">
      <span className="loading-state-spinner" aria-hidden="true" />
      <h2>집회를 불러오는 중</h2>
      <p>조건에 맞는 일정을 확인하고 있어요</p>
    </div>
  );
}
