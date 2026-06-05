export function EmptyState({ onOpenFilter }: { onOpenFilter: () => void }) {
  return (
    <div className="empty-state">
      <h2>해당 조건에 맞는 집회가 없어요</h2>
      <p>필터를 다시 조정해보세요</p>
      <button type="button" onClick={onOpenFilter}>
        필터 열기
      </button>
    </div>
  );
}
