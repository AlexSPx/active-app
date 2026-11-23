export interface CoachModelManifest {
  id: string
  url: string
  revision: string
  byteSize: number
  sha256: string
  quantization: string
  runtime: string
  tokenizerAndChatTemplate: string
  license: string
  settings: { contextTokens: number; temperature: number }
}

// Sizes and SHA-256 digests identify the exact downloadable artifacts.
export const coachModels: readonly CoachModelManifest[] = [
  {
    id: 'gemma-4-e2b-it-qat-q4-0',
    revision: '675cff42a74c774d6cb76f76d8eacb49b48c9b93',
    url: 'https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/675cff42a74c774d6cb76f76d8eacb49b48c9b93/gemma-4-E2B_q4_0-it.gguf',
    byteSize: 3349516256,
    sha256: 'fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634',
    quantization: 'Q4_0 QAT',
    runtime: 'llama.rn 0.13.0-rc.9; device compatibility unverified',
    tokenizerAndChatTemplate: 'GGUF embedded Gemma 4 tokenizer and chat template',
    license: 'Gemma terms: https://ai.google.dev/gemma/docs/gemma_4_license',
    settings: { contextTokens: 4096, temperature: 0.2 },
  },
  {
    id: 'qwen3-5-2b-workouts-q8-0',
    revision: 'full-20261105T212035Z',
    url: 'https://gbpgvjxjnr.ufs.sh/f/CYkAIDPhkDBq12FDIR40QWNPUuw9mgiyoFLRqIOMbSTHGxCz',
    byteSize: 2076674848,
    sha256: '7b3bd3549302569acdb7fde1c87e60dd620dce63d55132125b84bb7e5bfa12da',
    quantization: 'Q8_0',
    runtime: 'llama.rn 0.13.0-rc.9; device compatibility unverified',
    tokenizerAndChatTemplate: 'GGUF embedded Qwen3.5 tokenizer and chat template',
    license: 'Apache-2.0: https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE',
    settings: { contextTokens: 4096, temperature: 0.2 },
  },
]
