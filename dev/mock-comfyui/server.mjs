/**
 * Mock ComfyUI worker — a test double for the real thing.
 *
 * MOTIONA is a control surface: without a ComfyUI instance behind COMFYUI_URL
 * nothing can be verified end to end. This implements the subset of the ComfyUI
 * HTTP API that MOTIONA actually calls, and renders real video via render.py, so
 * queue -> poll -> history -> /view proxy -> gallery can be exercised for real.
 *
 * Endpoints implemented (matching comfyui/README.md and the route handlers):
 *   GET  /system_stats          GET  /queue
 *   POST /prompt                GET  /history[/:id]
 *   GET  /view                  POST /upload/image
 *   GET  /object_info[/:class]
 *
 * Test hooks:
 *   GET /__mock/state           — inspect the queue/history
 *   POST /__mock/reset          — clear everything
 *   A prompt containing MOCK_FAIL makes that job fail, to test error paths.
 *
 * Bind address stays 127.0.0.1 by default, matching the repo's guidance to keep
 * ComfyUI off any public interface.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(HERE, 'output');
const INPUT_DIR = path.join(HERE, 'input');

const HOST = process.env.MOCK_COMFYUI_HOST || '127.0.0.1';
const PORT = Number(process.env.MOCK_COMFYUI_PORT || 8188);
const QUEUE_DELAY_MS = Number(process.env.MOCK_QUEUE_DELAY_MS || 400);
const RENDER_MS = Number(process.env.MOCK_RENDER_MS || 2500);

/** prompt_id -> { graph, state, outputs, createdAt, error } */
const jobs = new Map();
let queueCounter = 0;

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(INPUT_DIR, { recursive: true });

/* ------------------------------------------------------------------ helpers */

const json = (res, code, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * ComfyUI rejects a graph whose links point at undefined nodes. Reproducing that
 * here means the app's own validator is tested against realistic behaviour
 * rather than only against a server that accepts anything.
 */
function findDanglingRefs(graph) {
  const ids = new Set(Object.keys(graph));
  const problems = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    if (!node || typeof node !== 'object' || !node.class_type) {
      problems.push(`node ${nodeId} has no class_type`);
      continue;
    }
    for (const [input, value] of Object.entries(node.inputs || {})) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      const [sourceId, slot] = value;
      if (typeof sourceId === 'string' && typeof slot === 'number' && !ids.has(sourceId)) {
        problems.push(`node ${nodeId} input ${input} references missing node ${sourceId}`);
      }
    }
  }
  return problems;
}

function promptTextOf(graph) {
  const texts = [];
  for (const node of Object.values(graph || {})) {
    const text = node?.inputs?.text;
    if (typeof text === 'string' && text.trim()) texts.push(text);
  }
  return texts.join('\n');
}

function renderSettingsFrom(graph) {
  let width = 1024, height = 576, frames = 32, fps = 16, seed = 0;
  for (const node of Object.values(graph || {})) {
    const inputs = node?.inputs || {};
    if (inputs.width) width = Number(inputs.width);
    if (inputs.height) height = Number(inputs.height);
    if (inputs.frame_rate) fps = Number(inputs.frame_rate);
    if (inputs.batch_size && Number(inputs.batch_size) > 4) frames = Number(inputs.batch_size);
    if (inputs.length) frames = Number(inputs.length);
    if (inputs.seed !== undefined) seed = Number(inputs.seed);
    if (inputs.noise_seed !== undefined) seed = Number(inputs.noise_seed);
  }
  // Keep mock renders small and fast; real dimensions come from the graph.
  return {
    width: Math.min(width, 640),
    height: Math.min(height, 360),
    frames: Math.max(8, Math.min(frames, 48)),
    fps: Math.min(Math.max(fps, 8), 24),
    seed: Math.abs(Math.floor(seed)) % 2147483647,
  };
}

function runRender(settings, outPath) {
  return new Promise((resolve) => {
    const proc = spawn(
      process.env.MOCK_PYTHON || 'python3',
      [
        path.join(HERE, 'render.py'),
        '--out', outPath,
        '--width', String(settings.width),
        '--height', String(settings.height),
        '--frames', String(settings.frames),
        '--fps', String(settings.fps),
        '--seed', String(settings.seed),
      ],
      { cwd: HERE },
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    const timer = setTimeout(() => proc.kill('SIGKILL'), 120000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      const produced = stdout.trim().split('\n').pop() || outPath;
      resolve({ code, produced, stderr: stderr.trim().slice(0, 500) });
    });
    proc.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, produced: '', stderr: String(error.message) });
    });
  });
}

/** Advance a job through queued -> running -> completed/failed. */
async function schedule(promptId) {
  const job = jobs.get(promptId);
  if (!job) return;

  await new Promise((r) => setTimeout(r, QUEUE_DELAY_MS));
  if (!jobs.has(promptId)) return;
  job.state = 'running';

  await new Promise((r) => setTimeout(r, RENDER_MS));
  if (!jobs.has(promptId)) return;

  const text = promptTextOf(job.graph);
  if (/MOCK_FAIL/i.test(text)) {
    job.state = 'error';
    job.error = {
      exception_message: 'Mock failure injected via MOCK_FAIL in prompt',
      current_node: { class_type: 'KSampler', id: '8' },
    };
    job.completedAt = new Date().toISOString();
    return;
  }

  const settings = renderSettingsFrom(job.graph);
  const base = `motiona_${promptId.slice(0, 8)}_${settings.seed}`;
  const outPath = path.join(OUTPUT_DIR, `${base}.mp4`);

  const result = await runRender(settings, outPath);
  if (!jobs.has(promptId)) return;

  if (result.code === 0 && result.produced && existsSync(result.produced)) {
    job.outputs = {
      '10': {
        videos: [
          {
            filename: path.basename(result.produced),
            subfolder: '',
            type: 'output',
            format: 'video/h264-mp4',
          },
        ],
      },
    };
    job.state = 'success';
  } else {
    job.state = 'error';
    job.error = {
      exception_message: `Render failed: ${result.stderr || 'unknown error'}`,
      current_node: { class_type: 'VHS_VideoCombine', id: '10' },
    };
  }
  job.completedAt = new Date().toISOString();
}

function historyEntry(promptId) {
  const job = jobs.get(promptId);
  if (!job) return null;
  const messages = [['execution_start', {}]];
  if (job.state === 'error' && job.error) messages.push(['execution_error', job.error]);
  if (job.state === 'success') messages.push(['execution_success', {}]);
  const status = { status_str: job.state, completed: job.state === 'success', messages };
  return { prompt: [promptId, job.clientId, job.graph, {}, []], outputs: job.outputs || {}, status };
}

/* ------------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (route === '/system_stats') {
      return json(res, 200, {
        system: { os: 'posix', python_version: '3.13', embedded_python: false },
        devices: [{ name: 'mock:0', type: 'cpu', index: 0, vram_total: 0, vram_free: 0, torch_vram_total: 0, torch_vram_free: 0 }],
        mock: true,
      });
    }

    if (route === '/queue' && req.method === 'GET') {
      const running = [];
      const pending = [];
      let n = 0;
      for (const [promptId, job] of jobs) {
        n += 1;
        const entry = [n, promptId, job.graph, {}, []];
        if (job.state === 'running') running.push(entry);
        else if (job.state === 'pending') pending.push(entry);
      }
      return json(res, 200, { queue_running: running, queue_pending: pending });
    }

    if (route === '/prompt' && req.method === 'POST') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'invalid JSON body' });
      }
      const graph = body?.prompt;
      if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
        return json(res, 400, { error: 'prompt graph object is required' });
      }

      const dangling = findDanglingRefs(graph);
      if (dangling.length) {
        return json(res, 400, {
          error: { type: 'invalid_graph', message: 'Graph contains references to undefined nodes', details: dangling },
        });
      }

      const promptId = crypto.randomUUID();
      queueCounter += 1;
      jobs.set(promptId, {
        graph,
        clientId: String(body.client_id || 'motiona'),
        state: 'pending',
        outputs: {},
        createdAt: new Date().toISOString(),
        number: queueCounter,
      });

      void schedule(promptId);
      return json(res, 200, { prompt_id: promptId, number: queueCounter, node_errors: {}, status: { status_str: 'success', completed: false } });
    }

    if (route === '/history' && req.method === 'GET') {
      const all = {};
      for (const [promptId, job] of jobs) {
        // ComfyUI only lists finished work in /history.
        if (job.state === 'success' || job.state === 'error') all[promptId] = historyEntry(promptId);
      }
      return json(res, 200, all);
    }

    const historyMatch = route.match(/^\/history\/(.+)$/);
    if (historyMatch && req.method === 'GET') {
      const promptId = decodeURIComponent(historyMatch[1]);
      const job = jobs.get(promptId);
      if (!job) return json(res, 200, {});
      if (job.state !== 'success' && job.state !== 'error') return json(res, 200, {});
      return json(res, 200, { [promptId]: historyEntry(promptId) });
    }

    if (route === '/view' && req.method === 'GET') {
      const filename = url.searchParams.get('filename');
      const type = url.searchParams.get('type') || 'output';
      if (!filename) return json(res, 400, { error: 'filename is required' });
      if (filename.includes('..') || filename.includes('/')) return json(res, 400, { error: 'invalid filename' });

      const dir = type === 'input' ? INPUT_DIR : OUTPUT_DIR;
      const file = path.join(dir, path.basename(filename));
      if (!existsSync(file)) return json(res, 404, { error: 'file not found' });

      const ext = path.extname(file).toLowerCase();
      const contentType = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=60' });
      createReadStream(file).pipe(res);
      return;
    }

    if (route === '/upload/image' && req.method === 'POST') {
      const raw = await readBody(req);
      // Minimal multipart handling: persist the payload under a generated name so
      // the reference-image path can be exercised without a full parser.
      const name = `upload_${Date.now()}.png`;
      await writeFile(path.join(INPUT_DIR, name), Buffer.from(raw, 'utf8'));
      return json(res, 200, { name, subfolder: '', type: 'input' });
    }

    if (route === '/object_info' || route.startsWith('/object_info/')) {
      const checkpoints = ['mock_sd15.safetensors', 'mock_sdxl.safetensors', 'mock_wan21.safetensors'];
      const info = {
        CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } }, output: ['MODEL', 'CLIP', 'VAE'] },
        KSampler: { input: { required: { seed: ['INT'], steps: ['INT'], cfg: ['FLOAT'], sampler_name: [['euler', 'dpmpp_2m']] } }, output: ['LATENT'] },
        VHS_VideoCombine: { input: { required: { images: ['IMAGE'], frame_rate: ['FLOAT'], filename_prefix: ['STRING'] } }, output: [] },
      };
      const wanted = route.split('/')[2];
      return json(res, 200, wanted ? { [wanted]: info[wanted] || {} } : info);
    }

    if (route === '/__mock/state') {
      return json(res, 200, {
        count: jobs.size,
        jobs: [...jobs.entries()].map(([id, job]) => ({
          promptId: id,
          state: job.state,
          outputs: job.outputs,
          error: job.error || null,
          createdAt: job.createdAt,
        })),
      });
    }

    if (route === '/__mock/reset' && req.method === 'POST') {
      jobs.clear();
      queueCounter = 0;
      for (const dir of [OUTPUT_DIR, INPUT_DIR]) {
        await rm(dir, { recursive: true, force: true });
        await mkdir(dir, { recursive: true });
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: `mock ComfyUI has no route ${route}` });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-comfyui] listening on http://${HOST}:${PORT}`);
  console.log(`[mock-comfyui] outputs -> ${OUTPUT_DIR}`);
  console.log(`[mock-comfyui] queue delay ${QUEUE_DELAY_MS}ms, render delay ${RENDER_MS}ms`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
