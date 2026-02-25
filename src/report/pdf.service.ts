import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFDict } from 'pdf-lib';
import { inflateSync } from 'zlib';
import type { PillarScores, PillarKey, TierKey } from '../common/types/scoring';
import { pillars } from '../common/config/pillars';
import { tiers } from '../common/config/tiers';
import { calculateTextWidth, wrapText, PAGE_WIDTH } from './font-metrics';

export interface PdfData {
  businessName: string;
  city: string;
  totalScore: number;
  tier: TierKey;
  pillarScores: PillarScores;
}

/**
 * Unicode code points that map to WinAnsiEncoding bytes 0x80-0x9F.
 * These differ from Latin-1/ISO-8859-1 in this range.
 */
const UNICODE_TO_WIN_ANSI: Record<number, number> = {
  0x20ac: 0x80, // Euro
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85, // ...
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91, // left single quote
  0x2019: 0x92, // right single quote
  0x201c: 0x93, // left double quote
  0x201d: 0x94, // right double quote
  0x2022: 0x95, // bullet
  0x2013: 0x96, // en dash
  0x2014: 0x97, // em dash
  0x02dc: 0x98,
  0x2122: 0x99, // TM
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** Placeholders that need centering and/or multi-line wrapping. */
const ALIGNED_PLACEHOLDERS: Record<
  string,
  { fontName: string; multiline: boolean; maxWidth: number; lineHeight: number }
> = {
  '{{Total_Score}}': { fontName: 'Roboto-Bold', multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_Name}}': { fontName: 'Roboto-Medium', multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Lowest_Pillar_Name}}': { fontName: 'Archivo-ExtraBold', multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_One_Liner}}': { fontName: 'Roboto-Bold', multiline: true, maxWidth: 450, lineHeight: 1.2 },
  '{{Lowest_Pillar_Impact_Statement}}': { fontName: 'Roboto-Regular', multiline: true, maxWidth: 400, lineHeight: 1.3 },
  '{{Segment_Description_Block}}': { fontName: 'Roboto-Regular', multiline: true, maxWidth: 490, lineHeight: 1.35 },
};

/** Placeholders handled by simple regex replacement (left-aligned / inline). */
const SIMPLE_KEYS = new Set([
  '{{Business_Name}}',
  '{{City_or_Service_Area}}',
  '{{Report_Date}}',
  '{{Visibility_Score}}',
  '{{Conversion_Score}}',
  '{{Reputation_Score}}',
  '{{Marketing_Score}}',
  '{{Tracking_Score}}',
  '{{Primary_Focus_Area}}',
]);

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private templateCache: Buffer | null = null;

  constructor() {}

  /** Read the template from disk once and cache it in memory. */
  private async getTemplate(): Promise<Buffer> {
    if (!this.templateCache) {
      const templatePath = join(process.cwd(), 'src/report/templates/dominance-playbook.pdf');
      this.templateCache = await readFile(templatePath);
      this.logger.log(`PDF template cached (${(this.templateCache.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    return this.templateCache;
  }

  /**
   * Load the Dominance Playbook PDF template and replace all
   * {{placeholder}} tokens with actual quiz/lead data.
   *
   * Three-pass replacement:
   *  0. Remove the developer note on page 5
   *  1. Simple regex for left-aligned / inline placeholders
   *  2. Stateful line-by-line scan for centered + multi-line placeholders
   */
  async generatePdfBuffer(data: PdfData): Promise<Buffer> {
    const templateBytes = await this.getTemplate();

    const tierData = tiers[data.tier];
    const lowestPillar = this.getLowestPillar(data.pillarScores);

    const allReplacements: Record<string, string> = {
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

    const simpleReplacements: Record<string, string> = {};
    const alignedReplacements: Record<string, string> = {};
    for (const [key, value] of Object.entries(allReplacements)) {
      if (SIMPLE_KEYS.has(key)) {
        simpleReplacements[key] = value;
      } else if (key in ALIGNED_PLACEHOLDERS) {
        alignedReplacements[key] = value;
      }
    }

    const pdfDoc = await PDFDocument.load(templateBytes);

    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (!('contents' in obj)) continue;

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

      // Pass 0: Remove developer note
      modified = this.removeDeveloperNote(modified);

      // Pass 1: Simple left-aligned / inline replacements
      modified = this.replaceTJOperations(modified, simpleReplacements);
      modified = this.replaceTjOperations(modified, simpleReplacements);

      // Pass 2: Centered + multi-line replacements
      modified = this.processAlignedReplacements(modified, alignedReplacements);

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

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ---------------------------------------------------------------------------
  // Pass 0 — Developer note removal
  // ---------------------------------------------------------------------------

  /** Blank out the "[Developer Note: ...]" static text on page 5. */
  private removeDeveloperNote(stream: string): string {
    return stream
      .replace(/\[([^\]]*Developer\s*Note[^\]]*)\]\s*TJ/g, '() Tj')
      .replace(/\[([^\]]*specific\s*segment[^\]]*)\]\s*TJ/g, '() Tj');
  }

  // ---------------------------------------------------------------------------
  // Pass 1 — Simple left-aligned replacements
  // ---------------------------------------------------------------------------

  private replaceTJOperations(
    stream: string,
    replacements: Record<string, string>,
  ): string {
    return stream.replace(/\[([^\]]*)\]\s*TJ/g, (fullMatch, arrayContent: string) => {
      const stringParts: string[] = [];
      const partRegex = /\(([^)]*)\)/g;
      let partMatch: RegExpExecArray | null;
      while ((partMatch = partRegex.exec(arrayContent)) !== null) {
        stringParts.push(partMatch[1]);
      }

      const concatenated = stringParts.join('');

      for (const [placeholder, value] of Object.entries(replacements)) {
        if (concatenated.includes(placeholder)) {
          const replaced = concatenated.replace(placeholder, this.escapePdfString(value));
          return `(${replaced}) Tj`;
        }
      }

      return fullMatch;
    });
  }

  private replaceTjOperations(
    stream: string,
    replacements: Record<string, string>,
  ): string {
    return stream.replace(/\(([^)]*)\)\s*Tj/g, (fullMatch, text: string) => {
      for (const [placeholder, value] of Object.entries(replacements)) {
        if (text.includes(placeholder)) {
          const replaced = text.replace(placeholder, this.escapePdfString(value));
          return `(${replaced}) Tj`;
        }
      }
      return fullMatch;
    });
  }

  // ---------------------------------------------------------------------------
  // Pass 2 — Centered + multi-line replacements
  // ---------------------------------------------------------------------------

  /**
   * Stateful line-by-line scan. Tracks Tm (text matrix) and Td (relative
   * moves) so centered placeholders can be repositioned and long text
   * word-wrapped into multiple lines.
   */
  private processAlignedReplacements(
    stream: string,
    replacements: Record<string, string>,
  ): string {
    if (!Object.keys(replacements).some((k) => stream.includes(k.replace(/[{}]/g, '')))) {
      return stream;
    }

    const lines = stream.split('\n');
    const output: string[] = [];

    let lastTmScale = 0;
    let lastTmX = 0;
    let lastTmY = 0;
    let lastTmOutputIdx = -1;
    let pendingTd: { x: number; y: number; outputIdx: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Track Tm: a b c d tx ty Tm
      const tmMatch = trimmed.match(
        /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+Tm$/,
      );
      if (tmMatch) {
        lastTmScale = parseFloat(tmMatch[1]) || parseFloat(tmMatch[4]);
        lastTmX = parseFloat(tmMatch[5]);
        lastTmY = parseFloat(tmMatch[6]);
        lastTmOutputIdx = output.length;
        pendingTd = null;
        output.push(lines[i]);
        continue;
      }

      // Track Td / TD
      const tdMatch = trimmed.match(/^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+T[dD]$/);
      if (tdMatch) {
        pendingTd = {
          x: parseFloat(tdMatch[1]),
          y: parseFloat(tdMatch[2]),
          outputIdx: output.length,
        };
        output.push(lines[i]);
        continue;
      }

      // Check TJ array for aligned placeholder
      const tjArrayMatch = trimmed.match(/^\[([^\]]*)\]\s*TJ$/);
      if (tjArrayMatch) {
        const concatenated = this.extractTJText(tjArrayMatch[1]);
        const found = this.findAlignedPlaceholder(concatenated, replacements);
        if (found) {
          this.emitAligned(
            output, found, replacements[found],
            lastTmScale, lastTmX, lastTmY, lastTmOutputIdx, pendingTd,
          );
          pendingTd = null;
          continue;
        }
      }

      // Check simple Tj for aligned placeholder
      const tjMatch = trimmed.match(/^\(([^)]*)\)\s*Tj$/);
      if (tjMatch) {
        const found = this.findAlignedPlaceholder(tjMatch[1], replacements);
        if (found) {
          this.emitAligned(
            output, found, replacements[found],
            lastTmScale, lastTmX, lastTmY, lastTmOutputIdx, pendingTd,
          );
          pendingTd = null;
          continue;
        }
      }

      output.push(lines[i]);
    }

    return output.join('\n');
  }

  /**
   * Emit correctly centered (and optionally wrapped) replacement text,
   * adjusting or replacing preceding Tm / Td lines in the output.
   */
  private emitAligned(
    output: string[],
    placeholder: string,
    rawValue: string,
    tmScale: number,
    tmX: number,
    tmY: number,
    tmOutputIdx: number,
    pendingTd: { x: number; y: number; outputIdx: number } | null,
  ): void {
    const config = ALIGNED_PLACEHOLDERS[placeholder];
    if (!config) return;

    const fontSize = tmScale;
    const escaped = this.escapePdfString(rawValue);

    // Compute absolute position
    let absY: number;
    if (pendingTd) {
      absY = tmY + pendingTd.y * tmScale;
      // Remove the Td line from output
      output.splice(pendingTd.outputIdx, 1);
    } else {
      absY = tmY;
    }

    if (!config.multiline) {
      // ---- Single-line centered ----
      const textWidth = calculateTextWidth(rawValue, config.fontName, fontSize);
      const newX = (PAGE_WIDTH / 2) - (textWidth / 2);

      if (!pendingTd && tmOutputIdx >= 0 && tmOutputIdx < output.length) {
        output[tmOutputIdx] = `${fontSize} 0 0 ${fontSize} ${newX.toFixed(3)} ${absY} Tm`;
      }
      output.push(`(${escaped}) Tj`);
    } else {
      // ---- Multi-line centered ----
      const wrapped = wrapText(rawValue, config.fontName, fontSize, config.maxWidth);
      const lineSpacingPt = fontSize * config.lineHeight;

      const newLines: string[] = [];
      for (let j = 0; j < wrapped.length; j++) {
        const lineEscaped = this.escapePdfString(wrapped[j]);
        const lineWidth = calculateTextWidth(wrapped[j], config.fontName, fontSize);
        const lineX = (PAGE_WIDTH / 2) - (lineWidth / 2);
        const lineY = absY - j * lineSpacingPt;
        newLines.push(`${fontSize} 0 0 ${fontSize} ${lineX.toFixed(3)} ${lineY.toFixed(3)} Tm`);
        newLines.push(`(${lineEscaped}) Tj`);
      }

      if (!pendingTd && tmOutputIdx >= 0 && tmOutputIdx < output.length) {
        output.splice(tmOutputIdx, 1, ...newLines);
      } else {
        output.push(...newLines);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
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

  /** Return the placeholder key if `text` contains an aligned placeholder. */
  private findAlignedPlaceholder(
    text: string,
    replacements: Record<string, string>,
  ): string | null {
    for (const key of Object.keys(replacements)) {
      if (text.includes(key)) return key;
    }
    return null;
  }

  /** Convert a Unicode string to WinAnsiEncoding bytes, then escape for PDF. */
  private escapePdfString(str: string): string {
    let result = '';
    for (const ch of str) {
      const cp = ch.codePointAt(0)!;
      const winByte = UNICODE_TO_WIN_ANSI[cp];
      if (winByte !== undefined) {
        result += String.fromCharCode(winByte);
      } else if (cp <= 0xff) {
        result += ch;
      } else {
        result += '?';
      }
    }
    return result
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
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
