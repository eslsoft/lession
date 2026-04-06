import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { getUvPath } from './bin-paths'

const UV_MANAGED_TOOLS = ['yt-dlp', 'whisperx'] as const
export type UvToolName = (typeof UV_MANAGED_TOOLS)[number]

let cachedBinDir: string | null = null

export function isUvManagedTool(name: string): name is UvToolName {
  return UV_MANAGED_TOOLS.includes(name as UvToolName)
}

async function runUv(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getUvPath(), args, { timeout: 300_000 })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr || `uv exited with code ${code}`))
    })
    proc.on('error', (err) => reject(err))
  })
}

export async function getUvBinDir(): Promise<string> {
  if (cachedBinDir) return cachedBinDir
  const dir = await runUv(['tool', 'dir', '--bin'])
  cachedBinDir = dir
  return dir
}

/** Returns the resolved path if the uv bin dir has been cached and the tool exists, otherwise null. */
export function getUvToolPath(toolName: UvToolName): string | null {
  if (!cachedBinDir) return null
  const bin = path.join(cachedBinDir, toolName)
  return fs.existsSync(bin) ? bin : null
}

export async function initUvToolPaths(): Promise<void> {
  try {
    await getUvBinDir()
  } catch (err) {
    console.log('[uv-tools] uv not available, tools will fall back to PATH:', (err as Error).message)
  }
}

function runUvToolAction(subcommand: 'install' | 'upgrade', name: UvToolName, onOutput?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getUvPath(), ['tool', subcommand, name], { timeout: 300_000 })
    proc.stdout.on('data', (d: Buffer) => onOutput?.(d.toString()))
    proc.stderr.on('data', (d: Buffer) => onOutput?.(d.toString()))
    proc.on('close', (code) => {
      if (code === 0) {
        cachedBinDir = null // force re-resolve so the new binary is found
        resolve()
      } else {
        reject(new Error(`uv tool ${subcommand} ${name} failed with code ${code}`))
      }
    })
    proc.on('error', (err) => reject(err))
  })
}

export function uvToolInstall(name: UvToolName, onOutput?: (line: string) => void): Promise<void> {
  return runUvToolAction('install', name, onOutput)
}

export function uvToolUpgrade(name: UvToolName, onOutput?: (line: string) => void): Promise<void> {
  return runUvToolAction('upgrade', name, onOutput)
}
