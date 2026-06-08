import type { StructuredEventInputMode } from "@/lib/structured-event-storage";
import {
  formatConfidence,
  formatStructuredDates,
  formatStructuredInputMode,
  formatTags,
  type StructuredEventResult,
} from "./structured-event-view";

type StructuredEventSummaryProps = {
  inputMode: StructuredEventInputMode | null;
  structuredEvent: StructuredEventResult;
};

export function StructuredEventSummary({
  inputMode,
  structuredEvent,
}: StructuredEventSummaryProps) {
  return (
    <section className="admin-structured-event">
      <div className="admin-structured-event-header">
        <h3>{structuredEvent.title || "제목 추출 안 됨"}</h3>
        <span>
          {formatConfidence(structuredEvent.confidence)} ·{" "}
          {formatStructuredInputMode(inputMode)}
        </span>
      </div>
      <dl>
        <div>
          <dt>일정</dt>
          <dd>{formatStructuredDates(structuredEvent.dates)}</dd>
        </div>
        <div>
          <dt>장소</dt>
          <dd>
            {[structuredEvent.venue, structuredEvent.address]
              .filter(Boolean)
              .join(" · ") || "미확인"}
          </dd>
        </div>
        <div>
          <dt>의제</dt>
          <dd>{formatTags(structuredEvent.issue_tags)}</dd>
        </div>
        <div>
          <dt>판정</dt>
          <dd>
            {structuredEvent.is_event ? "집회 후보" : "비대상"} ·{" "}
            {structuredEvent.status_hint || "미확인"}
          </dd>
        </div>
      </dl>
      {structuredEvent.exclusion_reason ? (
        <p>{structuredEvent.exclusion_reason}</p>
      ) : null}
    </section>
  );
}
