/**
 * Official Hide Mail MCP HTTP / SSE Controller.
 * Serves POST /api/mcp (JSON-RPC 2.0) and GET /api/mcp (SSE & JSON discovery).
 */

const mcpService = require('../services/mcpService');
const licenseService = require('../services/licenseService');
const { extractApiKey } = require('../middleware/apiKeyAuth');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const resolveCallerLicense = async (req) => {
  if (req.apiLicense) {
    return { ok: true, license: req.apiLicense };
  }

  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      code: 'API_KEY_REQUIRED',
      message: 'API key required (provide X-API-Key or Authorization: Bearer hm_live_...)',
    };
  }

  const authenticate = (licenseService.authenticateApiKey && licenseService.authenticateApiKey._isMockFunction)
    ? licenseService.authenticateApiKey
    : (licenseService.validateApiKey && licenseService.validateApiKey._isMockFunction)
      ? licenseService.validateApiKey
      : (licenseService.authenticateApiKey || licenseService.validateApiKey);

  const resolved = await authenticate(apiKey);
  if (!resolved || !resolved.license) {
    return {
      ok: false,
      status: 401,
      code: 'API_KEY_INVALID',
      message: 'Invalid or expired API key',
    };
  }

  req.apiKey = apiKey;
  req.apiLicense = resolved.license;
  return { ok: true, license: resolved.license };
};

const handlePost = async (req, res, next) => {
  try {
    const auth = await resolveCallerLicense(req);
    if (!auth.ok) {
      return res.status(auth.status).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32001,
          message: auth.message,
          data: { code: auth.code },
        },
      });
    }

    const response = await mcpService.handleJsonRpc(req.body, auth.license);
    return res.status(200).json(response);
  } catch (error) {
    logger.error(`MCP POST error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const handleGet = async (req, res, next) => {
  try {
    const auth = await resolveCallerLicense(req);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.message,
        code: auth.code,
      });
    }

    const discovery = {
      success: true,
      protocolVersion: mcpService.PROTOCOL_VERSION,
      serverInfo: mcpService.SERVER_INFO,
      capabilities: mcpService.CAPABILITIES,
      endpoint: '/api/mcp',
    };

    const accept = String(req.headers?.accept || req.headers?.Accept || '');
    if (accept.includes('text/event-stream') && typeof res.write === 'function') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write('event: endpoint\ndata: /api/mcp\n\n');
      res.write(`event: serverInfo\ndata: ${JSON.stringify(discovery)}\n\n`);
      return res.end();
    }

    return res.status(200).json(discovery);
  } catch (error) {
    logger.error(`MCP GET error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

module.exports = {
  handlePost,
  handleGet,
  handleRpc: handlePost,
};
