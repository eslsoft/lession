import { spawn } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import type { Segment } from '../../shared/types'

/**
 * Resolve the path to the spaCy NLP Python script.
 * In development it lives under the project root; when packaged it's
 * copied into the app's `resources` directory via extraResources.
 */
function getScriptPath(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'scripts', 'nlp_spacy.py')
  }
  return path.join(process.resourcesPath, 'scripts', 'nlp_spacy.py')
}

/**
 * Run spaCy NLP over transcript segments.
 *
 * Uses `uv run` to execute the Python script. The script contains PEP 723
 * inline metadata so uv automatically manages the spaCy dependency in a
 * cached virtual environment — no manual `pip install` needed.
 *
 * The script also auto-downloads the en_core_web_sm model on first run.
 */
export async function processTranscript(segments: Segment[]): Promise<Segment[]> {
  const scriptPath = getScriptPath()

  return new Promise((resolve, reject) => {
    const proc = spawn('uv', ['run', scriptPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Send segments as JSON via stdin
    proc.stdin.write(JSON.stringify(segments))
    proc.stdin.end()

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`spaCy NLP exited with code ${code}: ${stderr}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (err) {
        reject(new Error(`Failed to parse spaCy output: ${err}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start spaCy NLP: ${err.message}`))
    })
  })
}
