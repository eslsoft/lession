import { spawn } from 'node:child_process';

/**
 * Extract waveform peaks from an audio file using ffmpeg.
 * Decodes to 8kHz mono and computes ~200 peaks/second in a streaming fashion
 * so memory usage stays constant regardless of file size.
 */
export function extractPeaks(filePath: string): Promise<{ peaks: number[]; duration: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      '-f', 'f32le',
      '-ac', '1',
      '-ar', '8000',
      '-acodec', 'pcm_f32le',
      'pipe:1',
    ]);

    const SAMPLE_RATE = 8000;
    const PEAKS_PER_SEC = 200;
    const CHUNK_SIZE = SAMPLE_RATE / PEAKS_PER_SEC; // 40 samples per peak

    const peaks: number[] = [];
    let residualBuf = Buffer.alloc(0);
    let sampleCount = 0;
    let currentMax = 0;
    let samplesInChunk = 0;

    proc.stdout.on('data', (data: Buffer) => {
      const buf = residualBuf.length > 0 ? Buffer.concat([residualBuf, data]) : data;
      const usableBytes = buf.length - (buf.length % 4);
      residualBuf = usableBytes < buf.length ? Buffer.from(buf.subarray(usableBytes)) : Buffer.alloc(0);

      for (let offset = 0; offset < usableBytes; offset += 4) {
        const sample = buf.readFloatLE(offset);
        const abs = Math.abs(sample);
        if (abs > currentMax) currentMax = abs;
        samplesInChunk++;
        sampleCount++;

        if (samplesInChunk >= CHUNK_SIZE) {
          peaks.push(currentMax);
          currentMax = 0;
          samplesInChunk = 0;
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg peaks extraction failed: ${stderr}`));
        return;
      }
      if (samplesInChunk > 0) {
        peaks.push(currentMax);
      }
      const duration = sampleCount / SAMPLE_RATE;
      resolve({ peaks, duration });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}
