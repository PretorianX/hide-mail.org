/**
 * OpenAPI 3.1.0 JSON specification and Swagger UI routes.
 * Mounted at /api/openapi.json and /api/docs.
 */

const express = require('express');
const apiRateLimiter = require('../services/apiRateLimiter');
const { buildOpenApiSpec, buildSwaggerUiHtml } = require('../services/openApiSpec');

const router = express.Router();

const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

const resolveBaseUrl = (req) => {
  const rawHost = typeof req?.get === 'function' ? req.get('host') : req?.headers?.host;
  const host = typeof rawHost === 'string' ? rawHost.trim() : '';
  if (!host || !SAFE_HOST_PATTERN.test(host)) {
    return 'https://hide-mail.org';
  }
  const forwardedProto = req?.headers?.['x-forwarded-proto'];
  const rawProto = forwardedProto
    ? String(forwardedProto).split(',')[0].trim().toLowerCase()
    : String(req?.protocol || 'https').toLowerCase();
  const protocol = rawProto === 'http' ? 'http' : 'https';
  return `${protocol}://${host}`;
};

const handleOpenApiJson = (req, res) => {
  const spec = buildOpenApiSpec({ baseUrl: resolveBaseUrl(req) });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(spec);
};

const handleSwaggerUi = (req, res) => {
  const html = buildSwaggerUiHtml({ specUrl: '/api/openapi.json' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
};

router.get('/openapi.json', apiRateLimiter.default, handleOpenApiJson);
router.get('/docs', apiRateLimiter.default, handleSwaggerUi);

module.exports = router;
module.exports.handleOpenApiJson = handleOpenApiJson;
module.exports.handleSwaggerUi = handleSwaggerUi;
