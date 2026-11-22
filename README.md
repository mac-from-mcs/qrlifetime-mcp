# QRLifetime MCP server

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants make QR codes.

- **Static QR codes, free and offline.** `generate_qr_code` turns a URL or any text into an SVG QR code on your machine. No account, no network request, no watermark. The link is stored in the code itself, so it works for as long as the link does.
- **Dynamic QR codes with [QRLifetime](https://qrlifetime.com).** Create a code whose destination you can change after printing, read its scan count, update or delete it. These tools use the [QRLifetime REST API](https://qrlifetime.com/developers/) and need an API key from the Business plan. Codes keep redirecting to their last destination even if the plan ends.

## Tools

| Tool | What it does | API key |
| --- | --- | --- |
| `generate_qr_code` | SVG QR code of a URL or text, returned as text or written to an `.svg` file. Options: error correction (L, M, Q, H), colours, size. | No |
| `list_dynamic_qr_codes` | Your dynamic codes, newest first, 50 per page. | Yes |
| `create_dynamic_qr_code` | New editable code for a destination URL. Returns `shortUrl`, the URL to encode, and `link`, the same code as a qrkeep.me short link. | Yes |
| `get_dynamic_qr_code` | One code by slug, with its total scans. | Yes |
| `update_dynamic_qr_code` | Change the destination, name or style. Printed codes follow on the next scan. | Yes |
| `delete_dynamic_qr_code` | Delete a code. Its redirect stops, so printed copies stop working. | Yes |

To get a printable image of a dynamic code, create it, then pass its `shortUrl` to `generate_qr_code`.

## Install

Requires Node.js 18 or later.

### Claude Desktop, Cursor, Windsurf and other clients

Add the server to your client's MCP configuration:

```json
{
  "mcpServers": {
    "qrlifetime": {
      "command": "npx",
      "args": ["-y", "qrlifetime-mcp"],
      "env": { "QRLIFETIME_API_KEY": "qrl_..." }
    }
  }
}
```

Leave out `env` if you only need static QR codes.

### Claude Code

```bash
claude mcp add qrlifetime -e QRLIFETIME_API_KEY=qrl_... -- npx -y qrlifetime-mcp
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `QRLIFETIME_API_KEY` | API key created at [app.qrlifetime.com/api-keys](https://app.qrlifetime.com/api-keys) (Business plan). Only the dynamic-code tools need it. |
| `QRLIFETIME_API_BASE` | Override the API base URL. Defaults to `https://app.qrlifetime.com/api/v1`. |

Each API key allows 10,000 calls per calendar month. See the [API documentation](https://qrlifetime.com/developers/) for limits and errors.

## Privacy

`generate_qr_code` runs entirely on your machine. The other tools send requests only to the QRLifetime API, with your key, and only when the assistant calls them.

## Development

```bash
npm install
npm test
```

## Licence

MIT. QR encoding by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
