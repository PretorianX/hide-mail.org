#!/usr/bin/env node
/**
 * Official Hide Mail MCP Stdio Bridge (`mcp/hide-mail-mcp.js`).
 * Zero-dependency Node.js JSON-RPC 2.0 stdio transport that forwards MCP requests
 * from stdin to `${HIDE_MAIL_BASE_URL}/api/mcp` with `X-API-Key` and writes
 * JSON-RPC responses to stdout.
 */

const readline = require('node:readline');

const DEFAULT_BASE_URL = 'https://hide-mail.org';

const normalizeBaseUrl = (baseUrl) =>
  String(baseUrl || process.env.HIDE_MAIL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

const resolveApiKey = (apiKey) =>
  String(apiKey ?? process.env.HIDE_MAIL_API_KEY ?? '').trim();

const forwardJsonRpc = async (message, options = {}) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const apiKey = resolveApiKey(options.apiKey);
  const fetchFn = options.fetchImpl || global.fetch;

  const parsed = typeof message === 'string' ? JSON.parse(message) : message;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetchFn(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(parsed),
    });

    const data = await response.json();
    if (data && data.jsonrpc === '2.0') {
      return data;
    }

    return {
      jsonrpc: '2.0',
      id: parsed?.id ?? null,
      error: {
        code: -32000,
        message: data?.error || `HTTP ${response.status}`,
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: parsed?.id ?? null,
      error: {
        code: -32603,
        message: error.message || 'Failed to reach Hide Mail MCP endpoint',
      },
    };
  }
};

const createStdioBridge = (options = {}) => {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const errorOutput = options.errorOutput || process.stderr;

  const handleLine = async (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const parseErr = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error: invalid JSON on stdin',
        },
      };
      output.write(`${JSON.stringify(parseErr)}\n`);
      return parseErr;
    }

    const response = await forwardJsonRpc(parsed, options);
    output.write(`${JSON.stringify(response)}\n`);
    return response;
  };

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    handleLine(line).catch((err) => {
      errorOutput.write(`hide-mail-mcp error: ${err.message}\n`);
    });
  });

  return {
    handleLine,
    forwardJsonRpc: (msg) => forwardJsonRpc(msg, options),
    close: () => rl.close(),
  };
};

if (require.main === module) {
  createStdioBridge();
}

module.exports = {
  DEFAULT_BASE_URL,
  forwardJsonRpc,
  createStdioBridge,
};
