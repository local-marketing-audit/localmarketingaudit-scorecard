import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFDict, PDFName, PDFFont, cmyk, grayscale } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { inflateSync } from 'zlib';
import type { PillarScores, PillarKey, TierKey } from '../common/types/scoring';
import { pillars } from '../common/config/pillars';
import { tiers } from '../common/config/tiers';

export interface PdfData {
  businessName: string;
  city: string;
  totalScore: number;
  tier: TierKey;
  pillarScores: PillarScores;
}

/** Page width in PDF points (US Letter). */
const PAGE_WIDTH = 595.275;

/** All placeholder keys. */
const ALL_PLACEHOLDERS = [
  '{{Business_Name}}',
  '{{City_or_Service_Area}}',
  '{{Report_Date}}',
  '{{Total_Score}}',
  '{{Segment_Name}}',
  '{{Segment_One_Liner}}',
  '{{Visibility_Score}}',
  '{{Conversion_Score}}',
  '{{Reputation_Score}}',
  '{{Marketing_Score}}',
  '{{Tracking_Score}}',
  '{{Lowest_Pillar_Name}}',
  '{{Lowest_Pillar_Impact_Statement}}',
  '{{Segment_Description_Block}}',
  '{{Primary_Focus_Area}}',
];

type FontKey =
  | 'robotoRegular'
  | 'robotoBold'
  | 'robotoMedium'
  | 'archivoBold'
  | 'archivoExtraBold';

interface PlaceholderConfig {
  fontKey: FontKey;
  centered: boolean;
  multiline: boolean;
  maxWidth: number;
  lineHeight: number;
}

/**
 * Per-placeholder rendering config.
 * Font, centering, and multi-line wrapping settings.
 */
const PLACEHOLDER_CONFIG: Record<string, PlaceholderConfig> = {
  '{{Business_Name}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{City_or_Service_Area}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Report_Date}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Total_Score}}': { fontKey: 'robotoBold', centered: true, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_Name}}': { fontKey: 'robotoMedium', centered: true, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_One_Liner}}': { fontKey: 'robotoBold', centered: true, multiline: true, maxWidth: 450, lineHeight: 1.2 },
  '{{Visibility_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Conversion_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Reputation_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Marketing_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Tracking_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Lowest_Pillar_Name}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Lowest_Pillar_Impact_Statement}}': { fontKey: 'robotoRegular', centered: false, multiline: true, maxWidth: 400, lineHeight: 1.3 },
  '{{Segment_Description_Block}}': { fontKey: 'robotoRegular', centered: false, multiline: true, maxWidth: 490, lineHeight: 1.35 },
  '{{Primary_Focus_Area}}': { fontKey: 'robotoRegular', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
};

/** Recorded position of a placeholder found in a content stream. */
interface PlaceholderPosition {
  key: string;
  pageIndex: number;
  x: number;
  y: number;
  fontSize: number;
  fontKey: FontKey;
  color: { c: number; m: number; y: number; k: number } | { gray: number };
}

/** Map a BaseFont name (with subset prefix) to a FontKey. */
function baseFontToKey(name: string): FontKey | null {
  if (name.includes('Roboto-Medium')) return 'robotoMedium';
  if (name.includes('Roboto-Bold')) return 'robotoBold';
  if (name.includes('Roboto-Regular')) return 'robotoRegular';
  if (name.includes('Archivo-ExtraBold')) return 'archivoExtraBold';
  if (name.includes('Archivo-Bold')) return 'archivoBold';
  return null;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private templateCache: Buffer | null = null;
  private fontCache: Record<string, Buffer> | null = null;

  constructor() {}

  private async getTemplate(): Promise<Buffer> {
    if (!this.templateCache) {
      const templatePath = join(process.cwd(), 'src/report/templates/dominance-playbook.pdf');
      this.templateCache = await readFile(templatePath);
      this.logger.log(`PDF template cached (${(this.templateCache.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    return this.templateCache;
  }

  private async getFontBuffers(): Promise<Record<string, Buffer>> {
    if (!this.fontCache) {
      const fontsDir = join(process.cwd(), 'src/report/fonts');
      const [robotoRegular, robotoBold, robotoMedium, archivoBold, archivoExtraBold] =
        await Promise.all([
          readFile(join(fontsDir, 'Roboto-Regular.ttf')),
          readFile(join(fontsDir, 'Roboto-Bold.ttf')),
          readFile(join(fontsDir, 'Roboto-Medium.ttf')),
          readFile(join(fontsDir, 'Archivo-Bold.ttf')),
          readFile(join(fontsDir, 'Archivo-ExtraBold.ttf')),
        ]);
      this.fontCache = { robotoRegular, robotoBold, robotoMedium, archivoBold, archivoExtraBold };
      this.logger.log('Font files cached');
    }
    return this.fontCache;
  }

  /**
   * Generate a Dominance Playbook PDF by:
   * 1. Blanking all placeholder text in the template's content streams
   * 2. Drawing replacement text on each page using embedded full fonts
   */
  async generatePdfBuffer(data: PdfData): Promise<Buffer> {
    const templateBytes = await this.getTemplate();
    const fontBuffers = await this.getFontBuffers();

    const tierData = tiers[data.tier];
    const lowestPillar = this.getLowestPillar(data.pillarScores);

    const replacements: Record<string, string> = {
      '{{Business_Name}}': data.businessName,
      '{{City_or_Service_Area}}': data.city,
      '{{Report_Date}}': this.formatDate(new Date()),
      '{{Total_Score}}': String(data.totalScore),
      '{{Segment_Name}}': tierData.name,
      '{{Segment_One_Liner}}': tierData.summary,
      '{{Visibility_Score}}': String(data.pillarScores.visibility),
      '{{Conversion_Score}}': String(data.pillarScores.conversion),
      '{{Reputation_Score}}': String(data.pillarScores.reputation),
      '{{Marketing_Score}}': String(data.pillarScores.marketing),
      '{{Tracking_Score}}': String(data.pillarScores.tracking),
      '{{Lowest_Pillar_Name}}': pillars[lowestPillar].name,
      '{{Lowest_Pillar_Impact_Statement}}': pillars[lowestPillar].impactStatement,
      '{{Segment_Description_Block}}': tierData.descriptionBlock,
      '{{Primary_Focus_Area}}': pillars[lowestPillar].name,
    };

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    // Embed full fonts
    const fonts: Record<FontKey, PDFFont> = {
      robotoRegular: await pdfDoc.embedFont(fontBuffers.robotoRegular),
      robotoBold: await pdfDoc.embedFont(fontBuffers.robotoBold),
      robotoMedium: await pdfDoc.embedFont(fontBuffers.robotoMedium),
      archivoBold: await pdfDoc.embedFont(fontBuffers.archivoBold),
      archivoExtraBold: await pdfDoc.embedFont(fontBuffers.archivoExtraBold),
    };

    // Build content-stream-ref → page-index map
    const pages = pdfDoc.getPages();
    const refToPageIdx = new Map<string, number>();
    for (let i = 0; i < pages.length; i++) {
      const contentsRef = pages[i].node.get(PDFName.of('Contents'));
      if (contentsRef) refToPageIdx.set(contentsRef.toString(), i);
    }

    // Build per-page TT-name → FontKey mappings from resource dictionaries
    const pageFontMaps: Map<number, Record<string, FontKey>> = new Map();
    for (let i = 0; i < pages.length; i++) {
      const mapping: Record<string, FontKey> = {};
      const resources = pages[i].node.get(PDFName.of('Resources'));
      if (resources) {
        const resDict = pdfDoc.context.lookupMaybe(resources, PDFDict);
        if (resDict) {
          const fontRef = resDict.get(PDFName.of('Font'));
          if (fontRef) {
            const fontDict = pdfDoc.context.lookupMaybe(fontRef, PDFDict);
            if (fontDict) {
              for (const [name, fRef] of fontDict.entries()) {
                const fontObj = pdfDoc.context.lookupMaybe(fRef, PDFDict);
                if (!fontObj) continue;
                const bf = fontObj.get(PDFName.of('BaseFont'));
                if (!bf) continue;
                const key = baseFontToKey(bf.toString());
                if (key) mapping[name.toString().replace('/', '')] = key;
              }
            }
          }
        }
      }
      pageFontMaps.set(i, mapping);
    }

    // Phase A: Blank placeholders in streams and record their positions
    const positions: PlaceholderPosition[] = [];

    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (!('contents' in obj)) continue;

      const pageIndex = refToPageIdx.get(ref.toString());
      if (pageIndex === undefined) continue;

      let text: string;
      try {
        text = inflateSync(
          Buffer.from((obj as { contents: Uint8Array }).contents),
        ).toString('latin1');
      } catch {
        text = Buffer.from(
          (obj as { contents: Uint8Array }).contents,
        ).toString('latin1');
      }

      if (!text.includes('{{') && !text.includes('Developer Note')) continue;

      let modified = text;

      // Blank developer note
      modified = this.blankDeveloperNote(modified);

      const fontMap = pageFontMaps.get(pageIndex) ?? {};

      // Blank all placeholders and record positions
      modified = this.blankAndRecordPositions(modified, pageIndex, fontMap, positions);

      if (modified !== text) {
        const newStream = pdfDoc.context.flateStream(modified);
        if ('dict' in obj && (obj as { dict: unknown }).dict instanceof PDFDict) {
          const oldDict = (obj as { dict: PDFDict }).dict;
          for (const [dk, dv] of oldDict.entries()) {
            const key = dk.toString();
            if (key !== '/Length' && key !== '/Filter') {
              newStream.dict.set(dk, dv);
            }
          }
        }
        pdfDoc.context.assign(ref, newStream);
      }
    }

    // Phase B: Draw replacement text on pages using embedded fonts
    for (const pos of positions) {
      const value = replacements[pos.key];
      if (value === undefined) continue;

      const config = PLACEHOLDER_CONFIG[pos.key];
      if (!config) continue;

      const font = fonts[pos.fontKey];
      const page = pages[pos.pageIndex];
      const color = 'gray' in pos.color
        ? grayscale(pos.color.gray)
        : cmyk(pos.color.c, pos.color.m, pos.color.y, pos.color.k);

      if (config.multiline) {
        this.drawMultiline(page, value, font, pos.fontSize, pos.x, pos.y, color, config);
      } else if (config.centered) {
        const w = font.widthOfTextAtSize(value, pos.fontSize);
        const cx = (PAGE_WIDTH / 2) - (w / 2);
        page.drawText(value, { x: cx, y: pos.y, size: pos.fontSize, font, color });
      } else {
        page.drawText(value, { x: pos.x, y: pos.y, size: pos.fontSize, font, color });
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ---------------------------------------------------------------------------
  // Phase A helpers — blanking and position recording
  // ---------------------------------------------------------------------------

  /** Blank developer note TJ arrays. */
  private blankDeveloperNote(stream: string): string {
    return stream.replace(/\[([^\]]*)\]\s*TJ/g, (fullMatch, arrayContent: string) => {
      const concatenated = this.extractTJText(arrayContent);
      if (concatenated.includes('Developer Note') || concatenated.includes('specific segment')) {
        return '() Tj';
      }
      return fullMatch;
    });
  }

  /**
   * Scan stream line-by-line, tracking Tm/Td/Tf/color state.
   * When a placeholder is found in a TJ/Tj operator:
   *  - Record its position + resolved font
   *  - Replace it with `() Tj` (blank)
   */
  private blankAndRecordPositions(
    stream: string,
    pageIndex: number,
    fontMap: Record<string, FontKey>,
    positions: PlaceholderPosition[],
  ): string {
    if (!stream.includes('{{')) return stream;

    const lines = stream.split('\n');
    const output: string[] = [];

    // State tracking
    let tmA = 0;
    let tmD = 0;
    let tmX = 0;
    let tmY = 0;
    let currentFontKey: FontKey = 'robotoRegular';
    let fillColor: PlaceholderPosition['color'] = { gray: 0 };

    for (const line of lines) {
      const trimmed = line.trim();

      // Track Tf (font selection): /TT0 1 Tf
      const tfMatch = trimmed.match(/^\/(TT\d+)\s+[\d.]+\s+Tf$/);
      if (tfMatch) {
        const resolved = fontMap[tfMatch[1]];
        if (resolved) currentFontKey = resolved;
      }

      // Track CMYK fill color
      const cmykMatch = trimmed.match(
        /^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k$/,
      );
      if (cmykMatch) {
        fillColor = {
          c: parseFloat(cmykMatch[1]),
          m: parseFloat(cmykMatch[2]),
          y: parseFloat(cmykMatch[3]),
          k: parseFloat(cmykMatch[4]),
        };
      }

      // Track grayscale fill color
      const grayMatch = trimmed.match(/^([\d.]+)\s+g$/);
      if (grayMatch) {
        fillColor = { gray: parseFloat(grayMatch[1]) };
      }

      // Track Tm: a b c d tx ty Tm
      const tmMatch = trimmed.match(
        /^(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm$/,
      );
      if (tmMatch) {
        tmA = parseFloat(tmMatch[1]);
        tmD = parseFloat(tmMatch[4]);
        tmX = parseFloat(tmMatch[5]);
        tmY = parseFloat(tmMatch[6]);
        output.push(line);
        continue;
      }

      // Track Td / TD (relative move)
      const tdMatch = trimmed.match(/^(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]$/);
      if (tdMatch) {
        const dx = parseFloat(tdMatch[1]);
        const dy = parseFloat(tdMatch[2]);
        tmX += dx * tmA;
        tmY += dy * tmD;
        output.push(line);
        continue;
      }

      // Check TJ array for placeholder
      const tjArrayMatch = trimmed.match(/^\[([^\]]*)\]\s*TJ$/);
      if (tjArrayMatch) {
        const concatenated = this.extractTJText(tjArrayMatch[1]);
        const foundKey = this.findPlaceholder(concatenated);
        if (foundKey) {
          positions.push({
            key: foundKey,
            pageIndex,
            x: tmX,
            y: tmY,
            fontSize: tmA || tmD,
            fontKey: currentFontKey,
            color: { ...fillColor } as PlaceholderPosition['color'],
          });
          output.push('() Tj');
          continue;
        }
      }

      // Check Tj for placeholder
      const tjMatch = trimmed.match(/^\(([^)]*)\)\s*Tj$/);
      if (tjMatch) {
        const foundKey = this.findPlaceholder(tjMatch[1]);
        if (foundKey) {
          positions.push({
            key: foundKey,
            pageIndex,
            x: tmX,
            y: tmY,
            fontSize: tmA || tmD,
            fontKey: currentFontKey,
            color: { ...fillColor } as PlaceholderPosition['color'],
          });
          output.push('() Tj');
          continue;
        }
      }

      output.push(line);
    }

    return output.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Phase B helpers — drawing text
  // ---------------------------------------------------------------------------

  /** Word-wrap and draw multi-line text. */
  private drawMultiline(
    page: ReturnType<PDFDocument['getPages']>[0],
    text: string,
    font: PDFFont,
    fontSize: number,
    x: number,
    y: number,
    color: ReturnType<typeof cmyk> | ReturnType<typeof grayscale>,
    config: PlaceholderConfig,
  ): void {
    const wrappedLines = this.wrapText(text, font, fontSize, config.maxWidth);
    const lineSpacing = fontSize * config.lineHeight;

    for (let i = 0; i < wrappedLines.length; i++) {
      const lineText = wrappedLines[i];
      const lineY = y - i * lineSpacing;

      if (config.centered) {
        const w = font.widthOfTextAtSize(lineText, fontSize);
        const cx = (PAGE_WIDTH / 2) - (w / 2);
        page.drawText(lineText, { x: cx, y: lineY, size: fontSize, font, color });
      } else {
        page.drawText(lineText, { x, y: lineY, size: fontSize, font, color });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Concatenate string parts inside a TJ array, stripping kerning values. */
  private extractTJText(arrayContent: string): string {
    const parts: string[] = [];
    const partRegex = /\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = partRegex.exec(arrayContent)) !== null) {
      parts.push(match[1]);
    }
    return parts.join('');
  }

  /** Return the placeholder key if text contains one. */
  private findPlaceholder(text: string): string | null {
    for (const key of ALL_PLACEHOLDERS) {
      if (text.includes(key)) return key;
    }
    return null;
  }

  /** Word-wrap text to fit within maxWidth points. */
  private wrapText(
    text: string,
    font: PDFFont,
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private getLowestPillar(scores: PillarScores): PillarKey {
    const entries = Object.entries(scores) as [PillarKey, number][];
    entries.sort((a, b) => a[1] - b[1]);
    return entries[0][0];
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
