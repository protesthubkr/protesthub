export type OcrImage = {
  mediaKey: string;
  imageUrl: string;
};

export type PosterOcrResult = {
  text: string;
  model: string;
  provider: "openai_responses";
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OCR_MODEL = "gpt-5-mini";
const DEFAULT_IMAGE_DETAIL = "high";
const MAX_OCR_TEXT_LENGTH = 12000;

export class OcrConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured.") {
    super(message);
  }
}

export class OcrRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`OpenAI OCR request failed with status ${status}`);
  }
}

export async function runOpenAiPosterOcr(
  images: OcrImage[],
): Promise<PosterOcrResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new OcrConfigError();
  }

  if (images.length === 0) {
    return {
      text: "",
      model: getOcrModel(),
      provider: "openai_responses",
    };
  }

  const model = getOcrModel();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are an OCR engine for Korean civic event posters.",
                "Extract only visible text from the images.",
                "Preserve Korean, English, numbers, dates, times, places, organizers, URLs, and line breaks as much as possible.",
                "Do not summarize, translate, infer missing information, or add commentary.",
                "If there are multiple images, prefix each section with [image 1], [image 2], etc.",
                "If no text is readable, return OCR_TEXT_EMPTY.",
              ].join(" "),
            },
            ...images.map((image) => ({
              type: "input_image",
              image_url: image.imageUrl,
              detail: getImageDetail(),
            })),
          ],
        },
      ],
      max_output_tokens: 2000,
    }),
  });

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new OcrRequestError(response.status, payload);
  }

  return {
    text: normalizeOcrText(readOutputText(payload)),
    model,
    provider: "openai_responses",
  };
}

function getOcrModel() {
  return process.env.OPENAI_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
}

function getImageDetail() {
  const value = process.env.OPENAI_OCR_IMAGE_DETAIL?.trim();
  return value === "low" || value === "auto" || value === "high"
    ? value
    : DEFAULT_IMAGE_DETAIL;
}

function normalizeOcrText(text: string) {
  return text.replace(/\r\n/g, "\n").trim().slice(0, MAX_OCR_TEXT_LENGTH);
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = item.content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        if ("text" in part && typeof part.text === "string") {
          return [part.text];
        }

        return [];
      });
    })
    .join("\n")
    .trim();
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
