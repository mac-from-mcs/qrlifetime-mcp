import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createClient } from './api.js';
import { MAX_LENGTH, qrSvg } from './qr.js';

export const VERSION = '1.0.1';

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:$/.test(new URL(v).protocol), 'must be an http or https URL');
const failure = (err) => ({ isError: true, content: [{ type: 'text', text: err?.message || String(err) }] });

/**
 * API base override: https only (http allowed for localhost), so the key is never sent in clear
 * or to a malformed URL. Anything else falls back to the default with a warning on stderr.
 */
export function safeBase(value) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return value.replace(/\/+$/, '');
  } catch { /* invalid URL */ }
  console.error(`qrlifetime-mcp: ignoring QRLIFETIME_API_BASE (${value}): it must be an https URL.`);
  return undefined;
}

/** Builds the MCP server. `client` is injectable for tests. */
export function buildServer({ client = createClient({ apiKey: process.env.QRLIFETIME_API_KEY, baseUrl: safeBase(process.env.QRLIFETIME_API_BASE) }) } = {}) {
  const server = new McpServer({ name: 'qrlifetime', version: VERSION });

  server.registerTool(
    'generate_qr_code',
    {
      title: 'Generate a static QR code',
      description:
        'Generate a static QR code as SVG, offline, with no account. The link or text is stored inside the code itself, ' +
        'so it keeps working for as long as the link does, but it cannot be changed after printing. ' +
        'Use create_dynamic_qr_code instead when the destination may change or scans must be counted.',
      inputSchema: {
        text: z.string().min(1).max(MAX_LENGTH).describe('URL or text to encode.'),
        error_correction: z.enum(['L', 'M', 'Q', 'H']).optional().describe('L 7%, M 15% (default), Q 25%, H 30% of the code can be damaged.'),
        foreground: z.string().optional().describe('Hex colour of the modules, e.g. #000000. Keep it dark on a light background.'),
        background: z.string().optional().describe('Hex background colour, e.g. #ffffff.'),
        size: z.number().int().min(64).max(4096).optional().describe('Width and height of the SVG in pixels (default 512).'),
        output_path: z.string().optional().describe('Absolute path of a new .svg file to write (an existing file is never overwritten). When omitted, the SVG is returned as text.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ text: value, error_correction, foreground, background, size, output_path }) => {
      try {
        const { svg, modules, errorCorrection } = qrSvg(value, { errorCorrection: error_correction, foreground, background, size });
        if (output_path) {
          if (!isAbsolute(output_path) || !output_path.toLowerCase().endsWith('.svg')) throw new Error('output_path must be an absolute path ending in .svg.');
          // 'wx' never overwrites: an existing file (or symlink) at that path makes the call fail.
          try {
            await writeFile(output_path, svg, { encoding: 'utf8', flag: 'wx' });
          } catch (err) {
            if (err?.code === 'EEXIST') throw new Error(`${output_path} already exists; choose another file name.`);
            throw err;
          }
          return text(`QR code written to ${output_path} (${modules}×${modules} modules, error correction ${errorCorrection}).`);
        }
        return text(svg);
      } catch (err) {
        return failure(err);
      }
    },
  );

  const codeFields = {
    name: z.string().min(1).max(120).optional().describe('Your label for the code.'),
    design: z.record(z.unknown()).optional().describe('Style object from the QRLifetime editor (colours, logo, frame). Omit to use your brand kit.'),
  };

  server.registerTool(
    'list_dynamic_qr_codes',
    {
      title: 'List dynamic QR codes',
      description: 'List the dynamic (editable) QR codes of your QRLifetime account, newest first, 50 per page. Needs QRLIFETIME_API_KEY (Business plan).',
      inputSchema: { page: z.number().int().min(1).optional().describe('Page number, starting at 1.') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ page }) => {
      try {
        return text(await client.listCodes(page ?? 1));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'create_dynamic_qr_code',
    {
      title: 'Create a dynamic QR code',
      description:
        'Create an editable QR code that redirects to `destination`. The response gives `shortUrl` (the URL to encode in the QR code; ' +
        'pass it to generate_qr_code to get the image) and `link` (the same code as a short link on qrkeep.me). ' +
        'The destination can be changed later, scans are counted, and the code keeps redirecting even if the plan ends. Needs QRLIFETIME_API_KEY.',
      inputSchema: { destination: httpUrl.describe('http or https URL the code redirects to.'), ...codeFields },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ destination, name, design }) => {
      try {
        return text(await client.createCode({ destination, ...(name ? { name } : {}), ...(design ? { design } : {}) }));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'get_dynamic_qr_code',
    {
      title: 'Read a dynamic QR code',
      description: 'Read one dynamic QR code by its slug, with its destination and total number of scans. Needs QRLIFETIME_API_KEY.',
      inputSchema: { slug: z.string().describe('Slug of the code, e.g. ab3k7mx (the end of its short URL).') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ slug }) => {
      try {
        return text(await client.getCode(slug));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'update_dynamic_qr_code',
    {
      title: 'Change a dynamic QR code',
      description: 'Change the destination, name or style of a dynamic QR code. Printed codes follow the new destination on the next scan. Needs QRLIFETIME_API_KEY.',
      inputSchema: {
        slug: z.string().describe('Slug of the code.'),
        destination: httpUrl.optional().describe('New http or https destination.'),
        ...codeFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ slug, destination, name, design }) => {
      try {
        const input = { ...(destination ? { destination } : {}), ...(name ? { name } : {}), ...(design ? { design } : {}) };
        if (!Object.keys(input).length) throw new Error('Nothing to change: give destination, name or design.');
        return text(await client.updateCode(slug, input));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'delete_dynamic_qr_code',
    {
      title: 'Delete a dynamic QR code',
      description: 'Delete a dynamic QR code. Its redirect stops immediately, so any printed copy stops working. Only use it for codes that are not printed anywhere. Needs QRLIFETIME_API_KEY.',
      inputSchema: { slug: z.string().describe('Slug of the code.') },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ slug }) => {
      try {
        return text(await client.deleteCode(slug));
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
}
