import type { EventViewMode } from "@/lib/types";

type ViewModeSwitchProps = {
  viewMode: EventViewMode;
  onCalendarClick: () => void;
  onListClick: () => void;
};

export function ViewModeSwitch({
  viewMode,
  onCalendarClick,
  onListClick,
}: ViewModeSwitchProps) {
  const nextViewMode = viewMode === "list" ? "calendar" : "list";
  const label =
    nextViewMode === "calendar"
      ? "캘린더 보기로 전환"
      : "리스트 보기로 전환";
  const onClick = nextViewMode === "calendar" ? onCalendarClick : onListClick;

  return (
    <div className="view-mode-toggle">
      <button
        aria-label={label}
        className={`view-mode-button is-${nextViewMode}`}
        type="button"
        onClick={onClick}
      >
        <span aria-hidden="true" className="view-mode-icon" />
      </button>
    </div>
  );
}
