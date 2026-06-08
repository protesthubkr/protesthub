import type { CandidateStatus } from "@/lib/admin-candidates";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { runOpenAiPosterOcr, type OcrImage } from "@/lib/ocr/openai";
import { getOcrCandidateReasons } from "@/lib/ocr/signals";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type AdminSupabaseClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type CandidateForOcr = {
  id: string;
  status: CandidateStatus;
  text_snapshot: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown> | null;
  candidate_reason: string[];
};

type MediaForOcr = {
  media_key: string;
  url: string | null;
  preview_image_url: string | null;
};

export async function getCandidateForOcr(
  supabase: AdminSupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("x_event_candidates")
    .select(
      "id,status,text_snapshot,media_keys,extraction_payload,candidate_reason",
    )
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Candidate not found.");
  }

  return data as CandidateForOcr;
}

export async function createCandidateOcrUpdate(candidate: CandidateForOcr) {
  const media = await getMediaForOcr(candidate.media_keys);
  const images = media
    .map((item) => ({
      mediaKey: item.media_key,
      imageUrl: item.url ?? item.preview_image_url,
    }))
    .filter((item): item is OcrImage => Boolean(item.imageUrl));

  if (images.length === 0) {
    throw new Error("OCR을 실행할 이미지 URL이 없습니다.");
  }

  const ocr = await runOpenAiPosterOcr(images);
  const now = new Date().toISOString();
  const eventDateFilter = analyzePastEventNotice(
    `${candidate.text_snapshot}\n${ocr.text}`,
  );
  const nextReasons = mergeReasons(
    candidate.candidate_reason,
    eventDateFilter.ignoredAsPast
      ? [...getOcrCandidateReasons(ocr.text), "past_event_date"]
      : getOcrCandidateReasons(ocr.text),
  );
  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    event_date_filter: eventDateFilter,
    ocr: {
      provider: ocr.provider,
      model: ocr.model,
      ran_at: now,
      image_count: images.length,
      media_keys: images.map((image) => image.mediaKey),
    },
  };

  return {
    candidateReason: nextReasons,
    extractionPayload: nextPayload,
    ocrText: ocr.text || null,
    status: eventDateFilter.ignoredAsPast ? "ignored" : candidate.status,
    updatedAt: now,
  };
}

export async function getFirstCandidateImageUrl(mediaKeys: string[]) {
  const media = await getMediaForOcr(mediaKeys);
  const firstImage = media.find((item) => item.url || item.preview_image_url);
  return firstImage?.url ?? firstImage?.preview_image_url ?? "";
}

async function getMediaForOcr(mediaKeys: string[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase || mediaKeys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("x_media")
    .select("media_key,url,preview_image_url")
    .in("media_key", mediaKeys);

  if (error || !data) {
    throw new Error(error?.message ?? "OCR media not found.");
  }

  return data as MediaForOcr[];
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
