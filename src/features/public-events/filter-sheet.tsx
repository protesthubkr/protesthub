import type { ReactNode } from "react";
import { ISSUE_OPTIONS } from "@/lib/issues";
import type { EventFilters, FilterStep, IssueKey } from "@/lib/types";
import { FILTER_STEP_LABELS, FILTER_STEP_ORDER } from "./config";

type FilterSheetProps = {
  activeStep: FilterStep;
  draft: EventFilters;
  organizers: string[];
  regions: string[];
  onApply: () => void;
  onClose: () => void;
  onStepChange: (step: FilterStep) => void;
  onToggleAllIssues: () => void;
  onToggleAllOrganizers: () => void;
  onToggleAllRegions: () => void;
  onToggleIssue: (issue: IssueKey) => void;
  onToggleOrganizer: (organizer: string) => void;
  onToggleRegion: (region: string) => void;
};

export function FilterSheet({
  activeStep,
  draft,
  organizers,
  regions,
  onApply,
  onClose,
  onStepChange,
  onToggleAllIssues,
  onToggleAllOrganizers,
  onToggleAllRegions,
  onToggleIssue,
  onToggleOrganizer,
  onToggleRegion,
}: FilterSheetProps) {
  return (
    <div className="filter-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="filter-sheet-title"
        aria-modal="true"
        className="filter-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="filter-sheet-header">
          <button type="button" onClick={onClose}>
            닫기
          </button>
          <h1 id="filter-sheet-title">필터</h1>
          <button type="button" onClick={onApply}>
            적용
          </button>
        </div>

        <div className="filter-content">
          {activeStep === "issue" ? (
            <IssueFilterPanel
              selectedIssues={draft.issues}
              onToggleAll={onToggleAllIssues}
              onToggleIssue={onToggleIssue}
            />
          ) : null}

          {activeStep === "region" ? (
            <RegionFilterPanel
              regions={regions}
              selectedRegions={draft.regions}
              onToggleAll={onToggleAllRegions}
              onToggleRegion={onToggleRegion}
            />
          ) : null}

          {activeStep === "organizer" ? (
            <OrganizerFilterPanel
              organizers={organizers}
              selectedOrganizers={draft.organizers}
              onToggleAll={onToggleAllOrganizers}
              onToggleOrganizer={onToggleOrganizer}
            />
          ) : null}
        </div>

        <div className="step-tabs" role="tablist" aria-label="필터 단계">
          {FILTER_STEP_ORDER.map((step) => (
            <button
              aria-selected={activeStep === step}
              className={`step-tab ${activeStep === step ? "is-active" : ""}`}
              key={step}
              role="tab"
              type="button"
              onClick={() => onStepChange(step)}
            >
              {FILTER_STEP_LABELS[step]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function IssueFilterPanel({
  selectedIssues,
  onToggleAll,
  onToggleIssue,
}: {
  selectedIssues: IssueKey[];
  onToggleAll: () => void;
  onToggleIssue: (issue: IssueKey) => void;
}) {
  return (
    <FilterPanel title="관심 의제를 골라주세요" columns={2}>
      <ChoiceButton
        checked={
          selectedIssues.length === 0 ||
          selectedIssues.length === ISSUE_OPTIONS.length
        }
        fullWidth
        label="전체"
        onToggle={onToggleAll}
      />
      {ISSUE_OPTIONS.map((issue) => (
        <ChoiceButton
          checked={selectedIssues.includes(issue.key)}
          key={issue.key}
          label={issue.label}
          onToggle={() => onToggleIssue(issue.key)}
        />
      ))}
    </FilterPanel>
  );
}

function RegionFilterPanel({
  regions,
  selectedRegions,
  onToggleAll,
  onToggleRegion,
}: {
  regions: string[];
  selectedRegions: string[];
  onToggleAll: () => void;
  onToggleRegion: (region: string) => void;
}) {
  return (
    <FilterPanel title="지역을 골라주세요" columns={2}>
      <ChoiceButton
        checked={
          selectedRegions.length === 0 ||
          selectedRegions.length === regions.length
        }
        fullWidth
        label="전체"
        onToggle={onToggleAll}
      />
      {regions.map((region) => (
        <ChoiceButton
          checked={selectedRegions.includes(region)}
          key={region}
          label={region}
          onToggle={() => onToggleRegion(region)}
        />
      ))}
    </FilterPanel>
  );
}

function OrganizerFilterPanel({
  organizers,
  selectedOrganizers,
  onToggleAll,
  onToggleOrganizer,
}: {
  organizers: string[];
  selectedOrganizers: string[];
  onToggleAll: () => void;
  onToggleOrganizer: (organizer: string) => void;
}) {
  return (
    <FilterPanel title="주최 단체를 골라주세요">
      <ChoiceButton
        checked={
          organizers.length > 0 &&
          (selectedOrganizers.length === 0 ||
            selectedOrganizers.length === organizers.length)
        }
        label="전체"
        onToggle={onToggleAll}
      />
      {organizers.map((organizer) => (
        <ChoiceButton
          checked={selectedOrganizers.includes(organizer)}
          key={organizer}
          label={organizer}
          onToggle={() => onToggleOrganizer(organizer)}
        />
      ))}
    </FilterPanel>
  );
}

function FilterPanel({
  title,
  children,
  columns = 1,
}: {
  title: string;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <div className="filter-panel">
      <div className="filter-panel-heading">
        <h2>{title}</h2>
      </div>
      <div className={`choice-list ${columns === 2 ? "is-two-column" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function ChoiceButton({
  checked,
  fullWidth = false,
  label,
  onToggle,
}: {
  checked: boolean;
  fullWidth?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`choice-button ${checked ? "is-selected" : ""} ${
        fullWidth ? "is-full-width" : ""
      }`}
      type="button"
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
