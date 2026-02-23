import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFDict } from 'pdf-lib';
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

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor() {}

  /**
   * Load the Dominance Playbook PDF template and replace all
   * {{placeholder}} tokens with actual quiz/lead data.
   *
   * The Illustrator-generated PDF stores text in TJ/Tj operators
   * within FlateDecode content streams. Placeholders are often split
   * across kerning-adjusted string parts in TJ arrays, e.g.:
   *   [({{T)101.9(otal_Scor)9.6(e}})]TJ
   *
   * This function iterates every stream object, decompresses it,
   * performs regex replacement on TJ/Tj operations, and reassigns
   * the modified stream back into the PDF.
   */
  async generatePdfBuffer(data: PdfData): Promise<Buffer> {
    const templatePath = join(process.cwd(), 'src/report/templates/dominance-playbook.pdf');
    const templateBytes = await readFile(templatePath);

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

      // Fast check: does this stream contain any placeholder markers?
      if (!text.includes('{{')) continue;

      let modified = this.replaceTJOperations(text, replacements);
      modified = this.replaceTjOperations(modified, replacements);

      if (modified !== text) {
        const newStream = pdfDoc.context.flateStream(modified);

        // Preserve the original stream's dictionary entries (BBox, Subtype,
        // Resources, etc.) -- only Length and Filter are set by flateStream.
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

  /**
   * Replace TJ array operations like: [({{City_or_Service_Ar)10(ea}})]TJ
   * where the concatenated string parts form a known placeholder.
   */
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

  /**
   * Replace simple Tj operations like: ({{Business_Name}})Tj
   */
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
        // Character not in WinAnsiEncoding -- replace with '?'
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
