import { spawn } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import type { TtsResult } from './types'

function getScriptPath(scriptName: string): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'scripts', scriptName)
  }
  return path.join(process.resourcesPath, 'scripts', scriptName)
}

/**
 * Run a Python TTS script via `uv run`, feeding JSON on stdin and
 * parsing JSONL progress/result messages from stdout.
 */
export function runTtsScript(
  scriptName: string,
  input: Record<string, unknown>,
  outputPath: string,
  onProgress?: (percent: number) => void,
): Promise<TtsResult> {
  const scriptPath = getScriptPath(scriptName)

  return new Promise((resolve, reject) => {
    const proc = spawn('uv', ['run', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdin.write(JSON.stringify(input))
    proc.stdin.end()

    let lastResult: TtsResult | null = null
    let stderr = ''
    let stdoutBuffer = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'progress') {
            onProgress?.(msg.percent)
          } else if (msg.type === 'result') {
            lastResult = {
              duration: msg.duration,
              audioPath: outputPath,
              segments: msg.segments ?? [],
            }
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`TTS (${scriptName}) failed: ${stderr.trim() || `exit code ${code}`}`))
        return
      }
      if (!lastResult) {
        reject(new Error(`TTS (${scriptName}) completed but no result received`))
        return
      }
      resolve(lastResult)
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start TTS (${scriptName}): ${err.message}`))
    })
  })
}
