import type { FilterStep } from "@/lib/types";
import type { ConditionChip } from "./filters";

type ConditionChipsProps = {
  chips: ConditionChip[];
  onOpenFilter: (step: FilterStep) => void;
};

export function ConditionChips({ chips, onOpenFilter }: ConditionChipsProps) {
  return (
    <div className="condition-chip-row" aria-label="선택한 조건">
      {chips.map((chip) => (
        <button
          className="condition-chip"
          key={`${chip.step}-${chip.label}`}
          type="button"
          onClick={() => onOpenFilter(chip.step)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
