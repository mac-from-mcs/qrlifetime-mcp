// Thin client for the QRLifetime REST API v1 (https://qrlifetime.com/developers/).

export const DEFAULT_BASE = 'https://app.qrlifetime.com/api/v1';
const SLUG = /^[0-9A-Za-z]{4,16}$/;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createClient({ apiKey, baseUrl = DEFAULT_BASE, fetchImpl = fetch } = {}) {
  async function call(method, path, body) {
    if (!apiKey) {
      throw new ApiError(
        'No API key. Set QRLIFETIME_API_KEY to a key from https://app.qrlifetime.com/api-keys (Business plan). ' +
          'Static QR codes need no key: use generate_qr_code.',
        401,
      );
    }
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        'User-Agent': 'qrlifetime-mcp/1.0.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || `Request failed with status ${res.status}.`, res.status);
    return data;
  }

  const slugPath = (slug) => {
    if (!SLUG.test(slug ?? '')) throw new ApiError('slug must be 4 to 16 letters or digits.', 400);
    return `/codes/${encodeURIComponent(slug)}`;
  };

  return {
    listCodes: (page = 1) => call('GET', `/codes?page=${page}`),
    createCode: (input) => call('POST', '/codes', input),
    getCode: (slug) => call('GET', slugPath(slug)),
    updateCode: (slug, input) => call('PATCH', slugPath(slug), input),
    deleteCode: (slug) => call('DELETE', slugPath(slug)),
  };
}
