import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';

@Injectable()
export class PdfCompressService {
  private readonly logger = new Logger(PdfCompressService.name);

  /**
   * Compress a PDF buffer using Ghostscript.
   *
   * Uses the /ebook quality preset (150 DPI) to downsample images,
   * subset fonts, and strip unnecessary metadata.
   */
  async compress(inputBuffer: Buffer): Promise<Buffer> {
    const id = randomBytes(8).toString('hex');
    const inputPath = join(tmpdir(), `pdf-in-${id}.pdf`);
    const outputPath = join(tmpdir(), `pdf-out-${id}.pdf`);

    try {
      await writeFile(inputPath, inputBuffer);

      await this.runGhostscript(inputPath, outputPath);

      const compressedBuffer = await readFile(outputPath);

      const beforeMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
      const afterMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
      this.logger.log(`PDF compressed: ${beforeMB} MB → ${afterMB} MB`);

      return compressedBuffer;
    } finally {
      // Clean up temp files
      await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
    }
  }

  private runGhostscript(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.5',
          '-dPDFSETTINGS=/ebook',
          '-dNOPAUSE',
          '-dBATCH',
          '-dQUIET',
          '-dSubsetFonts=true',
          '-dCompressFonts=true',
          '-dEmbedAllFonts=true',
          '-dColorImageResolution=150',
          '-dGrayImageResolution=150',
          '-dMonoImageResolution=300',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          '-dDownsampleMonoImages=true',
          '-dAutoFilterColorImages=false',
          '-dColorImageFilter=/DCTEncode',
          '-dAutoFilterGrayImages=false',
          '-dGrayImageFilter=/DCTEncode',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { timeout: 30_000 },
        (error, _stdout, stderr) => {
          if (error) {
            this.logger.error(`Ghostscript failed: ${stderr}`);
            reject(new Error(`Ghostscript compression failed: ${error.message}`));
          } else {
            resolve();
          }
        },
      );
    });
  }
}
