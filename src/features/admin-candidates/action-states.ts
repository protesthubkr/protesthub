export type AdminActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ManualCandidateFormState = AdminActionState & {
  targetHref?: string;
};

export type ManualXPostFormState = ManualCandidateFormState;

export type ManualTelegramLinkFormState = ManualCandidateFormState;

export type XIngestControlState = AdminActionState;

export type TelegramChannelControlState = AdminActionState;
