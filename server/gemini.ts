import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 400,
      message: 'Gemini API key is missing or invalid. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'This AI model requires a billing-enabled Gemini API key. Select or update your key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'AI quota exceeded for the current API key tier. Upgrade or select a paid API key in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || 'Upstream AI service returned an error.',
  };
}

export interface ChatTurnInput {
  role: 'user' | 'assistant';
  content: string;
}

export async function runAiChat(params: {
  history: ChatTurnInput[];
  message: string;
  systemPrompt?: string;
}): Promise<{ reply: string; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-4-hydrogen';

  const conversationContents = [
    ...params.history.slice(-16).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [{ text: params.message }],
    },
  ];

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: conversationContents,
    config: {
      systemInstruction:
        params.systemPrompt?.trim() ||
        'You are KeyAi, a crisp, helpful, deeply knowledgeable AI assistant. Use clear formatting, code blocks when useful, and direct answers.',
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('The AI model returned an empty response.');
  }
  return { reply: text, model };
}

export async function runTextTool(params: {
  mode: 'rewrite' | 'translate' | 'generate';
  input: string;
  tone?: string;
  targetLanguage?: string;
  contentType?: string;
}): Promise<{ output: string; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-4-hydrogen';

  let instruction = '';
  let prompt = params.input;

  if (params.mode === 'rewrite') {
    instruction = `You are an expert editor. Rewrite the user's text in a ${params.tone || 'Professional'} tone while preserving all core facts and improving clarity, flow, and impact. Return only the rewritten text.`;
  } else if (params.mode === 'translate') {
    instruction = `You are a native-level translator. Translate the user's text accurately into ${params.targetLanguage || 'Spanish'}, preserving nuance, formatting, and tone. Return only the translated text.`;
  } else {
    instruction = `You are a creative strategist and writer. Generate high-craft ${params.contentType || 'Article / Copy'} content in a ${params.tone || 'Engaging'} tone based on the user's brief.`;
    prompt = `Brief: ${params.input}`;
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: instruction,
    },
  });

  const output = response.text?.trim();
  if (!output) {
    throw new Error('The AI model returned an empty result.');
  }
  return { output, model };
}

export async function runImageEdit(params: {
  imageBase64: string;
  mimeType: string;
  operation: 'edit' | 'remove_bg' | 'enhance';
  instruction?: string;
}): Promise<{ imageDataUrl: string; note: string; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-3.1-flash-lite-image';

  let editPrompt = params.instruction?.trim() || 'Improve lighting and composition.';
  if (params.operation === 'remove_bg') {
    editPrompt =
      'Isolate the primary foreground subject cleanly and remove the entire background, placing the subject on a pure solid #FFFFFF background with crisp, clean edges and zero background artifacts or shadows.';
  } else if (params.operation === 'enhance') {
    editPrompt =
      'Enhance this photo to studio-grade ultra-sharp quality: reduce noise and compression artifacts, sharpen fine textures and facial/object details, balance exposure and dynamic range naturally, while preserving the exact original subject and composition.';
  }

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: params.imageBase64,
            mimeType: params.mimeType,
          },
        },
        { text: editPrompt },
      ],
    },
  });

  let imageDataUrl = '';
  let note = '';

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      note += part.text;
    }
  }

  if (!imageDataUrl) {
    throw new Error('Photo editor did not return an edited image.');
  }

  return { imageDataUrl, note: note.trim(), model };
}

async function withUploadedGeminiFile<T>(
  ai: GoogleGenAI,
  base64Data: string,
  mimeType: string,
  fn: (fileUri: string) => Promise<T>
): Promise<T> {
  const ext = mimeType.includes('webm')
    ? 'webm'
    : mimeType.includes('quicktime') || mimeType.includes('mov')
    ? 'mov'
    : 'mp4';
  const tmpPath = path.join(os.tmpdir(), `keyai-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(tmpPath, buffer);

  let uploadedName: string | undefined;
  try {
    let file = await ai.files.upload({
      file: tmpPath,
      config: { mimeType },
    });
    uploadedName = file.name;

    let attempts = 0;
    while (file.state === 'PROCESSING' && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      file = await ai.files.get({ name: file.name || '' });
      attempts += 1;
    }
    if (file.state === 'FAILED') {
      throw new Error('Uploaded video processing failed.');
    }
    if (!file.uri) {
      throw new Error('Uploaded video did not receive a valid file URI.');
    }
    return await fn(file.uri);
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
    if (uploadedName) {
      await ai.files.delete({ name: uploadedName }).catch(() => undefined);
    }
  }
}

export function normalizeVideoEditInstruction(rawInstruction: string): string {
  const trimmed = rawInstruction.trim();
  if (!trimmed || /^(edit(\s+it)?|auto(\s+edit)?|enhance(\s+it)?)$/i.test(trimmed)) {
    return 'Edit and enhance this uploaded video: improve cinematic lighting, balanced color grading, crisp visual clarity, and overall studio polish while preserving the original subjects, camera motion, and composition.';
  }
  return trimmed;
}

export async function runVideoEdit(params: {
  videoBase64: string;
  mimeType: string;
  instruction: string;
}): Promise<{ videoDataUrl: string; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-omni-1.2-flash';
  const safeMime = params.mimeType || 'video/mp4';
  const finalPrompt = normalizeVideoEditInstruction(params.instruction);
  const approxBytes = Math.floor((params.videoBase64.length * 3) / 4);

  const executeEdit = async (videoInput: { type: 'video'; uri: string } | { type: 'video'; data: string; mime_type: string }) => {
    const interaction = await ai.interactions.create(
      {
        model,
        input: [
          videoInput,
          {
            type: 'text' as const,
            text: finalPrompt,
          },
        ],
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
        },
      },
      { timeout: 300000 }
    );

    const videoPart = interaction.output_video;
    if (!videoPart || !videoPart.data) {
      throw new Error('AI video editor did not return an edited video.');
    }

    const mime = videoPart.mime_type || 'video/mp4';
    return {
      videoDataUrl: `data:${mime};base64,${videoPart.data}`,
      model,
    };
  };

  if (approxBytes >= 4 * 1024 * 1024) {
    return await withUploadedGeminiFile(ai, params.videoBase64, safeMime, async (fileUri) =>
      executeEdit({ type: 'video', uri: fileUri })
    );
  }

  return await executeEdit({
    type: 'video',
    data: params.videoBase64,
    mime_type: safeMime,
  });
}

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

export async function runVideoSubtitles(params: {
  videoBase64: string;
  mimeType: string;
  language?: string;
}): Promise<{ subtitles: SubtitleCue[]; model: string }> {
  const ai = getAiClient();
  const model = 'gemini-4-hydrogen';
  const safeMime = params.mimeType || 'video/mp4';
  const approxBytes = Math.floor((params.videoBase64.length * 3) / 4);

  const executeSubtitles = async (
    videoPart:
      | { fileData: { fileUri: string; mimeType: string } }
      | { inlineData: { data: string; mimeType: string } }
  ) => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          videoPart,
          {
            text: `Generate accurate, timed video subtitles/captions in ${params.language || 'English'} covering the spoken dialogue and/or key visual narration cues across the video timeline.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startSec: { type: Type.NUMBER, description: 'Start timestamp in seconds.' },
              endSec: { type: Type.NUMBER, description: 'End timestamp in seconds.' },
              text: { type: Type.STRING, description: 'Concise subtitle caption text.' },
            },
            required: ['startSec', 'endSec', 'text'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as SubtitleCue[];
    return {
      subtitles: Array.isArray(parsed) ? parsed : [],
      model,
    };
  };

  if (approxBytes >= 8 * 1024 * 1024) {
    return await withUploadedGeminiFile(ai, params.videoBase64, safeMime, async (fileUri) =>
      executeSubtitles({ fileData: { fileUri, mimeType: safeMime } })
    );
  }

  return await executeSubtitles({
    inlineData: {
      data: params.videoBase64,
      mimeType: safeMime,
    },
  });
}
