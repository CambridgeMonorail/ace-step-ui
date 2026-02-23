import { writeFile, mkdir, copyFile, rm, readFile } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { handle_file } from '@gradio/client';

// Get audio duration using ffprobe
function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : Math.round(duration);
  } catch (error) {
    console.warn('Failed to get audio duration:', error);
    return 0;
  }
}
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { getGradioClient, resetGradioClient, isGradioAvailable } from './gradio-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../public/audio');

const ACESTEP_API = config.acestep.apiUrl;

// Resolve ACE-Step path (from env or default relative path)
function resolveAceStepPath(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  // Default: sibling directory (server/src/services -> ../../../ACE-Step-1.5 = app/ACE-Step-1.5)
  return path.resolve(__dirname, '../../../ACE-Step-1.5');
}

// Resolve Python path cross-platform (supports venv and portable installations)
export function resolvePythonPath(baseDir: string): string {
  // Allow explicit override via env var
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH;
  }

  const isWindows = process.platform === 'win32';
  const pythonExe = isWindows ? 'python.exe' : 'python';

  // Check for portable installation first (python_embeded)
  const portablePath = path.join(baseDir, 'python_embeded', pythonExe);
  if (existsSync(portablePath)) {
    return portablePath;
  }

  // Check common venv directory names (Pinokio uses 'env', others use '.venv' or 'venv')
  const venvDirs = ['env', '.venv', 'venv'];
  for (const venvDir of venvDirs) {
    const venvPython = isWindows
      ? path.join(baseDir, venvDir, 'Scripts', pythonExe)
      : path.join(baseDir, venvDir, 'bin', 'python');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  }

  // Fallback to first option (will produce a clear error if not found)
  if (isWindows) {
    return path.join(baseDir, 'env', 'Scripts', pythonExe);
  }
  return path.join(baseDir, 'env', 'bin', 'python');
}

const ACESTEP_DIR = resolveAceStepPath();
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const PYTHON_SCRIPT = path.join(SCRIPTS_DIR, 'simple_generate.py');

// ---------------------------------------------------------------------------
// Gradio generation: map params to the 45 positional args for /generation_wrapper
// ---------------------------------------------------------------------------

/**
 * Resolve an audio URL (e.g. /audio/file.mp3) to an absolute local file path.
 */
function resolveAudioPath(audioUrl: string): string {
  if (audioUrl.startsWith('/audio/')) {
    return path.join(AUDIO_DIR, audioUrl.replace('/audio/', ''));
  }
  if (audioUrl.startsWith('http')) {
    try {
      const parsed = new URL(audioUrl);
      if (parsed.pathname.startsWith('/audio/')) {
        return path.join(AUDIO_DIR, parsed.pathname.replace('/audio/', ''));
      }
    } catch { /* fall through */ }
  }
  return audioUrl;
}

/**
 * Prepare a local audio file for Gradio upload.
 * Returns a handle_file() wrapper or null if no file.
 */
async function prepareAudioFile(audioUrl: string | undefined): Promise<unknown> {
  if (!audioUrl) return null;

  const filePath = resolveAudioPath(audioUrl);

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.opus': 'audio/opus', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
    };
    const mimeType = mimeMap[ext] || 'audio/mpeg';
    const blob = new Blob([buffer], { type: mimeType });
    return handle_file(blob);
  } catch (error) {
    console.warn(`[Gradio] Failed to read audio file ${filePath}:`, error);
    // Fall back to URL-based reference if file can't be read locally
    if (audioUrl.startsWith('http')) {
      return handle_file(audioUrl);
    }
    return null;
  }
}

/**
 * Build the 50 positional arguments for the Gradio /generation_wrapper endpoint.
 */
async function buildGradioArgs(params: GenerationParams): Promise<unknown[]> {
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');
  const isThinking = params.thinking ?? false;
  const isEnhance = params.enhance ?? false;

  // Prepare audio files (async — reads from disk)
  const referenceAudio = await prepareAudioFile(params.referenceAudioUrl);
  const sourceAudio = await prepareAudioFile(params.sourceAudioUrl);

  // CoT features are gated by enhance OR thinking (either enables LLM enrichment)
  const useCot = isEnhance || isThinking;

  return [
    prompt,                                                       //  0: Music Caption
    lyrics,                                                       //  1: Lyrics
    (typeof params.bpm === 'number' && params.bpm > 0) ? params.bpm : 0, //  2: BPM (0 = auto)
    params.keyScale || '',                                        //  3: KeyScale
    params.timeSignature || '',                                   //  4: Time Signature
    params.vocalLanguage || 'en',                                 //  5: Vocal Language
    params.inferenceSteps ?? 8,                                   //  6: DiT Inference Steps
    params.guidanceScale ?? 7.0,                                  //  7: DiT Guidance Scale
    params.randomSeed !== false,                                  //  8: Random Seed
    params.seed ?? -1,                                            //  9: Seed (number, not string)
    referenceAudio,                                               // 10: Reference Audio (filepath | null)
    (typeof params.duration === 'number' && params.duration > 0) ? params.duration : -1, // 11: Audio Duration (-1 = auto)
    Math.min(Math.max(params.batchSize ?? 1, 1), 16),            // 12: Batch Size (clamped 1-16)
    sourceAudio,                                                  // 13: Source Audio (filepath | null)
    params.audioCodes || '',                                      // 14: LM Codes Hints
    params.repaintingStart ?? 0.0,                                // 15: Repainting Start
    params.repaintingEnd ?? -1,                                   // 16: Repainting End
    params.instruction || 'Fill the audio semantic mask with the style described in the text prompt.', // 17: Instruction
    params.audioCoverStrength ?? 1.0,                             // 18: LM Codes Strength
    params.taskType || 'text2music',                              // 19: Task Type
    params.useAdg ?? false,                                       // 20: Use ADG
    params.cfgIntervalStart ?? 0.0,                               // 21: CFG Interval Start
    params.cfgIntervalEnd ?? 1.0,                                 // 22: CFG Interval End
    params.shift ?? 3.0,                                          // 23: Shift
    params.inferMethod || 'ode',                                  // 24: Inference Method
    params.customTimesteps || '',                                 // 25: Custom Timesteps
    params.audioFormat || 'mp3',                                  // 26: Audio Format
    params.lmTemperature ?? 0.85,                                 // 27: LM Temperature
    isThinking,                                                   // 28: Think
    params.lmCfgScale ?? 2.0,                                    // 29: LM CFG Scale
    params.lmTopK ?? 0,                                           // 30: LM Top-K
    params.lmTopP ?? 0.9,                                         // 31: LM Top-P
    params.lmNegativePrompt || 'NO USER INPUT',                   // 32: LM Negative Prompt
    useCot ? (params.useCotMetas ?? true) : false,                // 33: CoT Metas
    useCot ? (params.useCotCaption ?? true) : false,              // 34: CaptionRewrite
    useCot ? (params.useCotLanguage ?? true) : false,             // 35: CoT Language
    params.isFormatCaption ?? false,                              // 36: Is Format Caption State
    params.constrainedDecodingDebug ?? false,                     // 37: Constrained Decoding Debug
    params.allowLmBatch ?? true,                                  // 38: ParallelThinking
    params.getScores ?? false,                                    // 39: Auto Score
    params.getLrc ?? false,                                       // 40: Auto LRC
    params.scoreScale ?? 0.5,                                     // 41: Quality Score Sensitivity
    params.lmBatchChunkSize ?? 8,                                 // 42: LM Batch Chunk Size
    params.trackName || null,                                     // 43: Track Name
    params.completeTrackClasses || [],                            // 44: Track Names
    params.autogen ?? false,                                      // 45: AutoGen
    0,                                                            // 46: Current Batch Index
    1,                                                            // 47: Total Batches
    [],                                                           // 48: Batch Queue
    {},                                                           // 49: Generation Params State
  ];
}

/**
 * Download a Gradio audio result file to local storage.
 * Gradio returns file objects with { url, path, orig_name, ... }.
 * We copy from the server-local path (same machine) or download via URL.
 */
async function downloadGradioAudioFile(
  fileObj: { url?: string; path?: string; orig_name?: string },
  destPath: string,
): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });

  // Prefer direct filesystem copy (both servers on same machine)
  if (fileObj.path && existsSync(fileObj.path)) {
    await copyFile(fileObj.path, destPath);
    return;
  }

  // Fall back to HTTP download via Gradio URL (use temp file for atomicity)
  if (fileObj.url) {
    const response = await fetch(fileObj.url);
    if (!response.ok) {
      throw new Error(`Failed to download Gradio audio: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('Downloaded audio file is empty');
    }
    const tmpPath = destPath + '.tmp';
    await writeFile(tmpPath, buffer);
    const { rename } = await import('fs/promises');
    await rename(tmpPath, destPath);
    return;
  }

  throw new Error('Gradio file object has neither path nor url');
}

// ---------------------------------------------------------------------------
// Generation types & interfaces (unchanged public API)
// ---------------------------------------------------------------------------

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  enhance?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModelPath?: string;

  // Sample Mode (for Simple Mode auto-generation)
  sampleMode?: boolean;
  sampleQuery?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;

  // Model selection
  ditModel?: string;
}

interface GenerationResult {
  audioUrls: string[];
  duration: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  status: string;
  // Auto-generated metadata (from Simple Mode with thinking=true)
  title?: string;
  lyrics?: string;
  caption?: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  result?: GenerationResult;
  error?: string;
}

interface ActiveJob {
  params: GenerationParams;
  startTime: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  taskId?: string;
  result?: GenerationResult;
  error?: string;
  processPromise?: Promise<void>;
  rawResponse?: unknown;
  queuePosition?: number;
  progress?: number;
  stage?: string;
}

const activeJobs = new Map<string, ActiveJob>();

// Periodic cleanup of old jobs (every 10 minutes, remove jobs older than 1 hour)
setInterval(() => cleanupOldJobs(3600000), 600000);

// Job queue for sequential processing (GPU can only handle one job at a time)
const jobQueue: string[] = [];
let isProcessingQueue = false;

// Health check - verify Gradio app is reachable
export async function checkSpaceHealth(): Promise<boolean> {
  return isGradioAvailable();
}

// Discover endpoints (for compatibility)
export async function discoverEndpoints(): Promise<unknown> {
  return { provider: 'acestep-gradio', endpoint: ACESTEP_API };
}

// Reset client — forces Gradio reconnection on next request
export function resetClient(): void {
  resetGradioClient();
}

// ---------------------------------------------------------------------------
// Job queue
// ---------------------------------------------------------------------------

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (jobQueue.length > 0) {
    const jobId = jobQueue[0];
    const job = activeJobs.get(jobId);

    if (job && job.status === 'queued') {
      try {
        await processGeneration(jobId, job.params, job);
      } catch (error) {
        console.error(`Queue processing error for ${jobId}:`, error);
      }
    }

    // Remove from queue after processing (whether success or failure)
    jobQueue.shift();

    // Update queue positions for remaining jobs
    jobQueue.forEach((id, index) => {
      const queuedJob = activeJobs.get(id);
      if (queuedJob) {
        queuedJob.queuePosition = index + 1;
      }
    });
  }

  isProcessingQueue = false;
}

// Submit generation job to queue
export async function generateMusicViaAPI(params: GenerationParams): Promise<{ jobId: string }> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const job: ActiveJob = {
    params,
    startTime: Date.now(),
    status: 'queued',
    queuePosition: jobQueue.length + 1,
  };

  activeJobs.set(jobId, job);
  jobQueue.push(jobId);

  console.log(`Job ${jobId}: Queued at position ${job.queuePosition}`);

  // Start processing the queue (will be a no-op if already processing)
  processQueue().catch(err => console.error('Queue processing error:', err));

  return { jobId };
}

// ---------------------------------------------------------------------------
// processGeneration — Gradio primary, Python spawn fallback
// ---------------------------------------------------------------------------

async function processGeneration(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  job.status = 'running';
  job.stage = 'Starting generation...';

  // Guard: cover/audio2audio requires a source or audio codes
  if ((params.taskType === 'cover' || params.taskType === 'audio2audio') && !params.sourceAudioUrl && !params.audioCodes) {
    job.status = 'failed';
    job.error = `task_type='${params.taskType}' requires a source audio or audio codes`;
    return;
  }

  // Use REST API for Simple Mode with sample_mode (auto-generates metadata)
  // This uses the documented /release_task endpoint with sample_mode + sample_query
  const useRestApi = !params.customMode && params.sampleMode;
  
  if (useRestApi) {
    try {
      console.log(`Job ${jobId}: Using REST API for Simple Mode with sample_mode=true`);
      await processGenerationViaRestAPI(jobId, params, job);
      return;
    } catch (error) {
      console.error(`Job ${jobId}: REST API generation failed, falling back to Gradio`, error);
      // Fall through to Gradio client
    }
  }

  // Try Gradio client for Custom Mode or if REST API is not used
  const gradioUp = await isGradioAvailable();
  if (gradioUp) {
    try {
      await processGenerationViaGradio(jobId, params, job);
      return;
    } catch (error) {
      console.error(`Job ${jobId}: Gradio generation failed, trying Python spawn fallback`, error);
      // Fall through to Python spawn
    }
  }

  // Fallback: Python spawn
  await processGenerationViaPython(jobId, params, job);
}

/**
 * Derive a short, meaningful title for a generated song.
 *
 * The ACE-Step API does not return a separate title field, so we synthesize
 * one from whatever information is available:
 *   1. User-provided title (params.title) — used as-is when non-empty.
 *   2. User's description (sampleQuery) — extract the "about …" clause.
 *   3. Auto-generated caption (first.prompt) — use the first phrase.
 *   4. Lyrics — use the first non-tag line.
 *   5. Fallback to undefined (caller should default to 'Untitled').
 */
function deriveTitle(
  userTitle?: string,
  sampleQuery?: string,
  caption?: string,
  lyrics?: string,
): string | undefined {
  const MAX = 60;

  // 1. User-provided title wins outright
  if (userTitle && userTitle.trim()) return userTitle.trim();

  // 2. Extract "about …" from the natural-language description
  if (sampleQuery) {
    const aboutMatch = sampleQuery.match(/\babout\s+(.+)/i);
    if (aboutMatch) {
      const raw = aboutMatch[1]
        .replace(/,?\s*(with|featuring|using|including)\b.*$/i, '') // trim trailing clauses
        .replace(/[.!?]+$/, '')                                    // trim punctuation
        .trim();
      if (raw.length > 0) {
        // Title-case the extracted phrase
        const titled = raw
          .split(/\s+/)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return titled.length > MAX ? titled.slice(0, MAX - 1) + '…' : titled;
      }
    }
    // No "about" clause — use first few significant words of the description
    const words = sampleQuery.trim().split(/\s+/);
    if (words.length > 0) {
      // Skip generic openers like "A", "An", and genre descriptors
      const phrase = words.slice(0, Math.min(6, words.length)).join(' ');
      const titled = phrase
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return titled.length > MAX ? titled.slice(0, MAX - 1) + '…' : titled;
    }
  }

  // 3. First phrase of the auto-generated caption
  if (caption) {
    const firstSentence = caption.split(/[.!?,;—–\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 0) {
      return firstSentence.length > MAX ? firstSentence.slice(0, MAX - 1) + '…' : firstSentence;
    }
  }

  // 4. First non-tag lyrics line
  if (lyrics) {
    const lines = lyrics.split('\n').filter(l => l.trim() && !l.trim().startsWith('['));
    if (lines.length > 0) {
      const first = lines[0].trim();
      return first.length > MAX ? first.slice(0, MAX - 1) + '…' : first;
    }
  }

  return undefined;
}

/**
 * Process generation using REST API (/release_task + /query_result).
 * See local/API.md for the full endpoint specification.
 *
 * This path is used for Simple Mode (sample_mode + sample_query) which
 * auto-generates caption, lyrics, and metas via the 5Hz LM before running DiT.
 *
 * Response parsing notes (from API.md §5.3):
 *   - status is an integer: 0 = queued/running, 1 = succeeded, 2 = failed
 *   - result is a JSON *string* that must be parsed into an array of objects
 *   - each result object has: file, prompt, lyrics, metas, generation_info, etc.
 *   - audio URLs are relative paths like /v1/audio?path=... (prepend ACESTEP_API)
 */
async function processGenerationViaRestAPI(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  // Determine if using Simple Mode (sample_mode workflow)
  const usingSampleMode = params.sampleMode && params.sampleQuery;
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');

  console.log(`Job ${jobId}: Using REST API /release_task`, {
    sampleMode: usingSampleMode,
    sampleQuery: usingSampleMode ? params.sampleQuery?.slice(0, 50) : undefined,
    prompt: !usingSampleMode ? prompt.slice(0, 50) : undefined,
    thinking: params.thinking,
    customMode: params.customMode,
  });

  // Build request body per local/API.md spec.
  // Only include fields that have meaningful values — the API uses its own
  // defaults for anything we omit (see §4.2 of the docs).
  const requestBody: any = {
    // ── Sample / description mode ──────────────────────────────────────
    // Per docs §4.2 "Sample/Description Mode Parameters":
    //   sample_mode: bool  – enables auto-generation of caption/lyrics/metas
    //   sample_query: str  – natural-language description (alias: description)
    ...(usingSampleMode && {
      sample_mode: true,
      sample_query: params.sampleQuery,
    }),

    // ── Custom / prompt mode ───────────────────────────────────────────
    // Only sent when NOT using sample mode (prompt + lyrics are explicit)
    ...(!usingSampleMode && {
      prompt,
      lyrics,
    }),

    // ── Core generation flags ──────────────────────────────────────────
    thinking: params.thinking ?? false,              // docs default: false
    vocal_language: params.vocalLanguage || 'en',    // docs default: "en"
    audio_format: params.audioFormat || 'mp3',       // docs default: "mp3"
    batch_size: Math.min(Math.max(params.batchSize ?? 1, 1), 8), // docs max: 8
    inference_steps: params.inferenceSteps ?? 8,     // docs default: 8
    guidance_scale: params.guidanceScale ?? 7.0,     // docs default: 7.0

    // ── Music attributes (omit when "auto") ────────────────────────────
    // docs: bpm range 30-300, null=auto; duration range 10-600, null=auto
    // Omit invalid/auto values so the API picks its own defaults.
    ...(params.duration && params.duration > 0 && { audio_duration: params.duration }),
    ...(params.bpm && params.bpm >= 30 && { bpm: params.bpm }),
    ...(params.keyScale && { key_scale: params.keyScale }),
    ...(params.timeSignature && { time_signature: params.timeSignature }),

    // ── Seed ───────────────────────────────────────────────────────────
    // docs: use_random_seed=true & seed=-1 → random
    use_random_seed: params.randomSeed !== false,
    ...(params.randomSeed === false && params.seed && { seed: params.seed }),

    // ── Model selection ────────────────────────────────────────────────
    // docs: parameter is "model", NOT "dit_model"
    ...(params.ditModel && { model: params.ditModel }),

    // ── 5Hz LM parameters ─────────────────────────────────────────────
    lm_model_path: params.lmModelPath || 'acestep-5Hz-lm-4B',
    lm_backend: params.lmBackend || 'pt',
    lm_temperature: params.lmTemperature ?? 0.85,    // docs default: 0.85
    lm_cfg_scale: params.lmCfgScale ?? 2.5,          // docs default: 2.5
    lm_top_p: params.lmTopP ?? 0.9,                  // docs default: 0.9
    lm_negative_prompt: params.lmNegativePrompt || 'NO USER INPUT',
    ...(params.lmTopK && { lm_top_k: params.lmTopK }),

    // ── Advanced DiT parameters ────────────────────────────────────────
    shift: params.shift ?? 3.0,
    infer_method: params.inferMethod || 'ode',
    use_adg: params.useAdg ?? false,
    cfg_interval_start: params.cfgIntervalStart ?? 0.0,
    cfg_interval_end: params.cfgIntervalEnd ?? 1.0,
    ...(params.customTimesteps && { timesteps: params.customTimesteps }),

    // ── LM CoT parameters ─────────────────────────────────────────────
    use_cot_caption: params.useCotCaption ?? true,
    use_cot_language: params.useCotLanguage ?? true,
    ...(params.constrainedDecodingDebug && { constrained_decoding_debug: true }),
    ...(params.allowLmBatch === false && { allow_lm_batch: false }),

    // ── Format / Enhance ───────────────────────────────────────────────
    // docs §4.2: use_format uses LM to enhance/format caption and lyrics
    ...(params.enhance && { use_format: true }),

    // ── Edit / Reference Audio ─────────────────────────────────────────
    // docs §4.2: reference_audio_path, src_audio_path, task_type, etc.
    ...(params.referenceAudioUrl && { reference_audio_path: params.referenceAudioUrl }),
    ...(params.sourceAudioUrl && { src_audio_path: params.sourceAudioUrl }),
    ...(params.audioCodes && { audio_code_string: params.audioCodes }),
    ...(params.taskType && params.taskType !== 'text2music' && { task_type: params.taskType }),
    ...(params.instruction && { instruction: params.instruction }),
    ...(params.repaintingStart != null && { repainting_start: params.repaintingStart }),
    ...(params.repaintingEnd != null && { repainting_end: params.repaintingEnd }),
    ...(params.audioCoverStrength != null && { audio_cover_strength: params.audioCoverStrength }),
  };

  job.stage = 'Submitting to REST API...';

  // Submit generation task
  const submitResponse = await fetch(`${ACESTEP_API}/release_task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!submitResponse.ok) {
    throw new Error(`REST API submission failed: ${submitResponse.status} ${submitResponse.statusText}`);
  }

  const submitData = await submitResponse.json() as {
    data: { task_id: string; status: string };
  };

  const taskId = submitData.data.task_id;
  job.taskId = taskId;
  console.log(`Job ${jobId}: REST API task created: ${taskId}`);

  // Poll for completion
  // Per local/API.md §3: status 0 = queued/running, 1 = succeeded, 2 = failed
  // Per local/API.md §5.3: result is a JSON string, must be parsed
  job.stage = 'Generating music...';
  let taskComplete = false;
  let pollAttempts = 0;
  const maxPollAttempts = 600; // 10 minutes timeout (1s interval)

  while (!taskComplete && pollAttempts < maxPollAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    pollAttempts++;

    const statusResponse = await fetch(`${ACESTEP_API}/query_result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id_list: [taskId] }),
    });

    if (!statusResponse.ok) {
      throw new Error(`REST API status check failed: ${statusResponse.status}`);
    }

    // Response shape per §5.3:
    // { data: [{ task_id, status: int, result: string, progress_text?: string }] }
    const statusData = await statusResponse.json() as {
      data: Array<{
        task_id: string;
        status: number;          // 0=queued/running, 1=succeeded, 2=failed
        result?: string;         // JSON string — must be parsed
        progress_text?: string;  // LM progress info while running
      }>;
    };

    const taskResult = statusData.data[0];
    if (!taskResult) {
      if (pollAttempts % 10 === 0) {
        console.log(`Job ${jobId}: Polling... no task entry yet (attempt ${pollAttempts})`);
      }
      continue;
    }

    // Status is an integer per §3
    const status = taskResult.status;

    if (pollAttempts % 10 === 0) {
      console.log(`Job ${jobId}: status=${status}, poll attempt ${pollAttempts}`);
    }

    // Update stage with progress text if available (shows LM reasoning progress)
    if (taskResult.progress_text) {
      job.stage = `Generating: ${taskResult.progress_text.slice(-80)}`;
    }

    if (status === 2) {
      // §3: status 2 = failed
      throw new Error(`REST API task failed: ${taskResult.result || 'Unknown error'}`);
    }

    if (status === 1) {
      // §3: status 1 = succeeded
      taskComplete = true;

      // §5.3: result is a JSON string containing an array of result objects
      // Each object has: file, wave, status, prompt, lyrics, metas, generation_info, etc.
      let resultItems: Array<{
        file?: string;
        status?: number;
        prompt?: string;
        lyrics?: string;
        metas?: { bpm?: number; duration?: number; keyscale?: string; timesignature?: string };
        generation_info?: string;
        seed_value?: string;
        lm_model?: string;
        dit_model?: string;
      }>;

      try {
        resultItems = JSON.parse(taskResult.result || '[]');
      } catch (parseErr) {
        throw new Error(`Failed to parse REST API result JSON: ${parseErr}`);
      }

      if (!Array.isArray(resultItems) || resultItems.length === 0) {
        throw new Error('REST API returned empty result array');
      }

      // Download audio files
      // §10: audio URLs are relative paths like /v1/audio?path=...
      const audioUrls: string[] = [];
      let actualDuration = 0;

      for (const item of resultItems) {
        if (!item.file) continue;

        // Build full URL: ACESTEP_API + item.file
        const audioDownloadUrl = item.file.startsWith('http')
          ? item.file
          : `${ACESTEP_API}${item.file}`;

        const ext = audioDownloadUrl.includes('.flac') ? '.flac' : `.${params.audioFormat || 'mp3'}`;
        const filename = `${jobId}_${audioUrls.length}${ext}`;
        const destPath = path.join(AUDIO_DIR, filename);

        await mkdir(AUDIO_DIR, { recursive: true });

        const audioResponse = await fetch(audioDownloadUrl);
        if (!audioResponse.ok) {
          console.error(`Job ${jobId}: Failed to download audio: ${audioResponse.status} from ${audioDownloadUrl}`);
          continue;
        }

        const buffer = Buffer.from(await audioResponse.arrayBuffer());
        if (buffer.length === 0) {
          console.error(`Job ${jobId}: Downloaded audio file is empty`);
          continue;
        }
        await writeFile(destPath, buffer);

        if (audioUrls.length === 0) {
          actualDuration = getAudioDuration(destPath);
        }

        audioUrls.push(`/audio/${filename}`);
      }

      if (audioUrls.length === 0) {
        throw new Error('REST API returned no downloadable audio files');
      }

      // Extract metadata from the first result item (§5.3 result field description)
      const first = resultItems[0];
      const apiDuration = typeof first.metas?.duration === 'number' && first.metas.duration > 0
        ? first.metas.duration
        : undefined;
      const paramDuration = typeof params.duration === 'number' && params.duration > 0
        ? params.duration
        : undefined;
      const finalDuration = actualDuration > 0
        ? actualDuration
        : (apiDuration ?? paramDuration ?? 60);

      // Generate a title since the API doesn't return one.
      // Priority: params.title (user-provided) > derive from sampleQuery > derive from caption
      const autoTitle = deriveTitle(
        params.title,
        params.sampleQuery,
        first.prompt,
        first.lyrics,
      );

      job.status = 'succeeded';
      job.result = {
        audioUrls,
        duration: finalDuration,
        bpm: first.metas?.bpm || params.bpm,
        keyScale: first.metas?.keyscale || params.keyScale,
        timeSignature: first.metas?.timesignature || params.timeSignature,
        // Auto-generated metadata from sample_mode / thinking
        title: autoTitle,
        lyrics: first.lyrics,
        caption: first.prompt,  // §5.3: "prompt" field contains the generated/enhanced caption
        status: 'succeeded',
      };
      job.rawResponse = statusData;
      console.log(`Job ${jobId}: Completed via REST API`, {
        audioFiles: audioUrls.length,
        lyricsPreview: first.lyrics?.substring(0, 80),
        captionPreview: first.prompt?.substring(0, 80),
        metas: first.metas,
        generationInfo: first.generation_info,
      });

    } else if (status === 0) {
      // §3: status 0 = still queued or running, keep polling
      job.stage = taskResult.progress_text
        ? `Generating: ${taskResult.progress_text.slice(-80)}`
        : 'Generating music...';
    }
  }

  if (!taskComplete) {
    throw new Error(`REST API generation timed out after ${pollAttempts} seconds`);
  }
}

async function processGenerationViaGradio(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  const client = await getGradioClient();
  const args = await buildGradioArgs(params);

  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);

  console.log(`Job ${jobId}: Using Gradio /generation_wrapper`, {
    prompt: prompt.slice(0, 50),
    duration: params.duration,
    batchSize: params.batchSize,
  });

  job.stage = 'Generating music via Gradio...';

  // predict() blocks until generation is complete
  const result = await client.predict('/generation_wrapper', args);
  const data = result.data as unknown[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Gradio returned unexpected data format: ${typeof data}`);
  }

  // Extract audio files from the result
  // Outputs 0-7: individual audio samples (filepath objects)
  // Output 8: "All Generated Files" as list[filepath]
  // Output 9: "Generation Details" (string)
  // Output 10: "Generation Status" (string)
  // Output 11: "Seed" (string)
  const allFiles = data[8]; // list of file objects
  const genDetails = data[9] as string | undefined;
  const genStatus = data[10] as string | undefined;

  // Collect audio file objects — prefer the "All Generated Files" list
  let audioFileObjects: Array<{ url?: string; path?: string; orig_name?: string }> = [];

  if (Array.isArray(allFiles) && allFiles.length > 0) {
    audioFileObjects = allFiles.filter(
      (f: any) => f && (f.path || f.url) && isAudioFile(f.orig_name || f.path || '')
    );
  }

  // Fallback: check individual sample outputs (indices 0-7)
  if (audioFileObjects.length === 0) {
    for (let i = 0; i < 8; i++) {
      const fileObj = data[i] as any;
      if (fileObj && (fileObj.path || fileObj.url)) {
        audioFileObjects.push(fileObj);
      }
    }
  }

  if (audioFileObjects.length === 0) {
    throw new Error(`Gradio generation returned no audio files. Status: ${genStatus || 'unknown'}. Details: ${genDetails || 'none'}`);
  }

  // Download audio files to local storage
  const audioUrls: string[] = [];
  let actualDuration = 0;
  const audioFormat = params.audioFormat ?? 'mp3';

  for (const fileObj of audioFileObjects) {
    const origName = fileObj.orig_name || fileObj.path || '';
    const ext = origName.includes('.flac') ? '.flac' : `.${audioFormat}`;
    const filename = `${jobId}_${audioUrls.length}${ext}`;
    const destPath = path.join(AUDIO_DIR, filename);

    await downloadGradioAudioFile(fileObj, destPath);

    if (audioUrls.length === 0) {
      actualDuration = getAudioDuration(destPath);
    }

    audioUrls.push(`/audio/${filename}`);
  }

  // Parse metadata from generation details if available
  const metas = parseGenerationDetails(genDetails);

  const finalDuration = actualDuration > 0
    ? actualDuration
    : (metas.duration || params.duration || 60);

  job.status = 'succeeded';
  job.result = {
    audioUrls,
    duration: finalDuration,
    bpm: metas.bpm || params.bpm,
    keyScale: metas.keyScale || params.keyScale,
    timeSignature: metas.timeSignature || params.timeSignature,
    // Include auto-generated content from Simple Mode (when autogen=true)
    title: metas.title,
    lyrics: metas.lyrics,
    caption: metas.caption,
    status: 'succeeded',
  };
  job.rawResponse = { genDetails, genStatus };
  console.log(`Job ${jobId}: Completed via Gradio with ${audioUrls.length} audio files`);
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|flac|wav|ogg|m4a)$/i.test(name);
}

function parseGenerationDetails(details: string | undefined): {
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
  title?: string;
  lyrics?: string;
  caption?: string;
} {
  if (!details) return {};
  try {
    // Generation details may contain key-value pairs and auto-generated content
    const bpmMatch = details.match(/BPM:\s*(\d+)/i);
    const durationMatch = details.match(/Duration:\s*([\d.]+)/i);
    const keyMatch = details.match(/Key:\s*([A-G][#b]?\s*(?:major|minor))/i);
    const timeMatch = details.match(/Time Signature:\s*(\d+\/\d+)/i);
    
    // Extract auto-generated content (from Simple Mode autogen)
    const titleMatch = details.match(/Title:\s*(.+?)(?:\n|$)/i);
    const lyricsMatch = details.match(/Lyrics:\s*([\s\S]+?)(?:\n(?:BPM|Key|Time|Duration|Caption|Title|$))/i);
    const captionMatch = details.match(/Caption:\s*(.+?)(?:\n|$)/i);
    
    return {
      bpm: bpmMatch ? parseInt(bpmMatch[1]) : undefined,
      duration: durationMatch ? parseFloat(durationMatch[1]) : undefined,
      keyScale: keyMatch ? keyMatch[1] : undefined,
      timeSignature: timeMatch ? timeMatch[1] : undefined,
      title: titleMatch ? titleMatch[1].trim() : undefined,
      lyrics: lyricsMatch ? lyricsMatch[1].trim() : undefined,
      caption: captionMatch ? captionMatch[1].trim() : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Python spawn fallback (kept from original for offline/fallback use)
// ---------------------------------------------------------------------------

async function processGenerationViaPython(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');

  console.log(`Job ${jobId}: Using Python spawn (Gradio not available)`, {
    prompt: prompt.slice(0, 50),
    lyricsPreview: lyrics.slice(0, 50),
    duration: params.duration,
    batchSize: params.batchSize,
  });

  try {
    const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
    await mkdir(jobOutputDir, { recursive: true });

    const durationToSend = params.duration && params.duration > 0 ? params.duration : 60;
    const args = [
      '--prompt', prompt,
      '--duration', String(durationToSend),
      '--batch-size', String(params.batchSize ?? 1),
      '--infer-steps', String(params.inferenceSteps ?? 8),
      '--guidance-scale', String(params.guidanceScale ?? 10.0),
      '--audio-format', params.audioFormat ?? 'mp3',
      '--output-dir', jobOutputDir,
      '--json',
    ];

    if (lyrics) args.push('--lyrics', lyrics);
    if (params.instrumental) args.push('--instrumental');
    if (params.bpm && params.bpm > 0) args.push('--bpm', String(params.bpm));
    if (params.keyScale) args.push('--key-scale', params.keyScale);
    if (params.timeSignature) args.push('--time-signature', params.timeSignature);
    if (params.vocalLanguage) args.push('--vocal-language', params.vocalLanguage);
    if (params.seed !== undefined && params.seed >= 0 && !params.randomSeed) args.push('--seed', String(params.seed));
    if (params.shift !== undefined) args.push('--shift', String(params.shift));
    if (params.taskType && params.taskType !== 'text2music') args.push('--task-type', params.taskType);

    if (params.referenceAudioUrl) {
      args.push('--reference-audio', resolveAudioPath(params.referenceAudioUrl));
    }
    if (params.sourceAudioUrl) {
      args.push('--src-audio', resolveAudioPath(params.sourceAudioUrl));
    }
    if (params.audioCodes) args.push('--audio-codes', params.audioCodes);
    if (params.repaintingStart !== undefined && params.repaintingStart > 0) args.push('--repainting-start', String(params.repaintingStart));
    if (params.repaintingEnd !== undefined && params.repaintingEnd > 0) args.push('--repainting-end', String(params.repaintingEnd));
    if (params.taskType === 'cover' || params.taskType === 'repaint' || params.sourceAudioUrl) {
      args.push('--audio-cover-strength', String(params.audioCoverStrength ?? 1.0));
    } else if (params.audioCoverStrength !== undefined && params.audioCoverStrength !== 1.0) {
      args.push('--audio-cover-strength', String(params.audioCoverStrength));
    }
    if (params.instruction) args.push('--instruction', params.instruction);
    if (params.thinking) args.push('--thinking');
    if (params.lmTemperature !== undefined) args.push('--lm-temperature', String(params.lmTemperature));
    if (params.lmCfgScale !== undefined) args.push('--lm-cfg-scale', String(params.lmCfgScale));
    if (params.lmTopK !== undefined && params.lmTopK > 0) args.push('--lm-top-k', String(params.lmTopK));
    if (params.lmTopP !== undefined) args.push('--lm-top-p', String(params.lmTopP));
    if (params.lmNegativePrompt) args.push('--lm-negative-prompt', params.lmNegativePrompt);
    // Note: --lm-backend and --lm-model are not supported by simple_generate.py
    if (params.useCotMetas === false) args.push('--no-cot-metas');
    if (params.useCotCaption === false) args.push('--no-cot-caption');
    if (params.useCotLanguage === false) args.push('--no-cot-language');
    if (params.useAdg) args.push('--use-adg');
    if (params.cfgIntervalStart !== undefined && params.cfgIntervalStart > 0) args.push('--cfg-interval-start', String(params.cfgIntervalStart));
    if (params.cfgIntervalEnd !== undefined && params.cfgIntervalEnd < 1.0) args.push('--cfg-interval-end', String(params.cfgIntervalEnd));

    const result = await runPythonGeneration(args);

    if (!result.success) {
      throw new Error(result.error || 'Generation failed');
    }

    if (!result.audio_paths || result.audio_paths.length === 0) {
      throw new Error('No audio files generated');
    }

    const audioUrls: string[] = [];
    let actualDuration = 0;
    for (const srcPath of result.audio_paths) {
      const ext = srcPath.includes('.flac') ? '.flac' : '.mp3';
      const filename = `${jobId}_${audioUrls.length}${ext}`;
      const destPath = path.join(AUDIO_DIR, filename);

      await mkdir(AUDIO_DIR, { recursive: true });
      await copyFile(srcPath, destPath);

      if (audioUrls.length === 0) {
        actualDuration = getAudioDuration(destPath);
      }

      audioUrls.push(`/audio/${filename}`);
    }

    try {
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Job ${jobId}: Failed to cleanup output dir`, cleanupError);
    }

    const finalDuration = actualDuration > 0 ? actualDuration : (params.duration && params.duration > 0 ? params.duration : 60);

    job.status = 'succeeded';
    job.result = {
      audioUrls,
      duration: finalDuration,
      bpm: params.bpm,
      keyScale: params.keyScale,
      timeSignature: params.timeSignature,
      status: 'succeeded',
    };
    job.rawResponse = result;
    console.log(`Job ${jobId}: Completed via Python in ${result.elapsed_seconds?.toFixed(1)}s with ${audioUrls.length} audio files`);

  } catch (error) {
    console.error(`Job ${jobId}: Generation failed`, error);
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Generation failed';

    try {
      const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}

interface PythonResult {
  success: boolean;
  audio_paths?: string[];
  elapsed_seconds?: number;
  error?: string;
}

function runPythonGeneration(scriptArgs: string[], timeoutMs = 600000): Promise<PythonResult> {
  return new Promise((resolve) => {
    const pythonPath = resolvePythonPath(ACESTEP_DIR);
    const args = [PYTHON_SCRIPT, ...scriptArgs];

    const proc = spawn(pythonPath, args, {
      cwd: ACESTEP_DIR,
      env: {
        ...process.env,
        ACESTEP_PATH: ACESTEP_DIR,
      },
    });

    // Kill process after timeout (default 10 minutes)
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 5000);
      resolve({ success: false, error: `Generation timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[ACE-Step] ${line}`);
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

      const lines = stdout.split('\n').filter(l => l.trim());
      const jsonLine = lines.find(l => l.startsWith('{'));

      if (!jsonLine) {
        resolve({ success: false, error: 'No JSON output from generation script' });
        return;
      }

      try {
        const result = JSON.parse(jsonLine);
        resolve(result);
      } catch {
        resolve({ success: false, error: 'Invalid JSON from generation script' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Job status (simplified — no more REST polling for progress)
// ---------------------------------------------------------------------------

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      status: 'failed',
      error: 'Job not found',
    };
  }

  if (job.status === 'succeeded' && job.result) {
    return {
      status: 'succeeded',
      result: job.result,
    };
  }

  if (job.status === 'failed') {
    return {
      status: 'failed',
      error: job.error || 'Generation failed',
    };
  }

  const elapsed = Math.floor((Date.now() - job.startTime) / 1000);

  if (job.status === 'queued') {
    return {
      status: job.status,
      queuePosition: job.queuePosition,
      etaSeconds: (job.queuePosition || 1) * 180,
    };
  }

  // Running — Gradio handles its own queue, we just report estimated time
  return {
    status: job.status,
    etaSeconds: Math.max(0, 180 - elapsed),
    progress: job.progress,
    stage: job.stage,
  };
}

// Get raw response for debugging
export function getJobRawResponse(jobId: string): unknown | null {
  const job = activeJobs.get(jobId);
  return job?.rawResponse || null;
}

// ---------------------------------------------------------------------------
// Audio helpers (unchanged)
// ---------------------------------------------------------------------------

export async function getAudioStream(audioPath: string): Promise<Response> {
  if (audioPath.startsWith('http')) {
    return fetch(audioPath);
  }

  if (audioPath.startsWith('/audio/')) {
    const localPath = path.join(AUDIO_DIR, audioPath.replace('/audio/', ''));
    try {
      const buffer = await readFile(localPath);
      const ext = localPath.endsWith('.flac') ? 'flac' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch (err) {
      console.error('Failed to read local audio file:', localPath, err);
      return new Response(null, { status: 404 });
    }
  }

  // Absolute path — try reading directly from disk (Gradio output files)
  if (audioPath.startsWith('/')) {
    try {
      const buffer = await readFile(audioPath);
      const ext = audioPath.endsWith('.flac') ? 'flac' : audioPath.endsWith('.wav') ? 'wav' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch {
      // Fall through to Gradio API
    }
  }

  const url = `${ACESTEP_API}/v1/audio?path=${encodeURIComponent(audioPath)}`;
  console.log('Fetching audio from:', url);
  return fetch(url);
}

export async function downloadAudio(remoteUrl: string, songId: string): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });

  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const ext = remoteUrl.includes('.flac') ? '.flac' : '.mp3';
  const filename = `${songId}${ext}`;
  const filepath = path.join(AUDIO_DIR, filename);

  await writeFile(filepath, Buffer.from(buffer));
  console.log(`Downloaded audio to ${filepath}`);

  return `/audio/${filename}`;
}

export async function downloadAudioToBuffer(remoteUrl: string): Promise<{ buffer: Buffer; size: number }> {
  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, size: buffer.length };
}

export function cleanupJob(jobId: string): void {
  activeJobs.delete(jobId);
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [jobId, job] of activeJobs) {
    if (now - job.startTime > maxAgeMs) {
      activeJobs.delete(jobId);
    }
  }
}
