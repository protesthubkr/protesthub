import { formatCandidateReason } from "./reason-labels";

export function CandidateReasonList({ reasons }: { reasons: string[] }) {
  return (
    <div className="admin-reason-list" aria-label="후보 생성 근거">
      {reasons.length > 0 ? (
        reasons.map((reason) => (
          <span key={reason}>{formatCandidateReason(reason)}</span>
        ))
      ) : (
        <span>근거 없음</span>
      )}
    </div>
  );
}
