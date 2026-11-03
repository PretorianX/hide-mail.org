process.env.VALID_DOMAINS = 'hide-mail.org';

jest.mock('../../services/apiRateLimiter', () => ({
  default: (req, res, next) => next(),
}));

const { OPENAPI_VERSION, buildOpenApiSpec, buildSwaggerUiHtml } = require('../../services/openApiSpec');
const { handleOpenApiJson, handleSwaggerUi } = require('../../routes/openApi');

describe('OpenAPI 3.1.0 Specification & Swagger UI', () => {
  test('builds a valid OpenAPI 3.1.0 specification covering all Deliverability, QA, and MCP endpoints', () => {
    const spec = buildOpenApiSpec({ baseUrl: 'https://hide-mail.org' });

    expect(spec.openapi).toBe('3.1.0');
    expect(OPENAPI_VERSION).toBe('3.1.0');
    expect(spec.info.title).toContain('Hide Mail');
    expect(spec.servers[0].url).toBe('https://hide-mail.org');

    // Security schemes
    expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    expect(spec.components.securitySchemes.ApiKeyHeader.name).toBe('X-API-Key');

    // Deliverability Suite paths
    expect(spec.paths['/api/mail-grade'].post.operationId).toBe('gradeEmail');
    expect(spec.paths['/api/sender-check'].post.operationId).toBe('senderCheck');
    expect(spec.paths['/api/dmarc-reports'].post.operationId).toBe('readDmarcReport');
    expect(spec.paths['/api/bounce-read'].post.operationId).toBe('readBounce');
    expect(spec.paths['/api/complaint-read'].post.operationId).toBe('readComplaint');
    expect(spec.paths['/api/invite-read'].post.operationId).toBe('readInvite');

    // QA Mailbox paths
    expect(spec.paths['/api/qa/mailboxes'].post.operationId).toBe('createQaMailbox');
    expect(spec.paths['/api/qa/mailboxes/{email}/messages'].get.operationId).toBe('listQaMessages');
    expect(spec.paths['/api/qa/mailboxes/{email}/messages/{id}'].get.operationId).toBe('getQaMessage');
    expect(
      spec.paths['/api/qa/mailboxes/{email}/messages/{id}/attachments/{index}'].get.operationId
    ).toBe('downloadQaAttachment');
    expect(spec.paths['/api/qa/mailboxes/{email}/webhook'].put.operationId).toBe('setQaWebhook');
    expect(spec.paths['/api/qa/mailboxes/{email}'].delete.operationId).toBe('deleteQaMailbox');

    // MCP paths
    expect(spec.paths['/api/mcp'].get.operationId).toBe('discoverMcpServer');
    expect(spec.paths['/api/mcp'].post.operationId).toBe('callMcpJsonRpc');
  });

  test('renders Swagger UI HTML pointing at /api/openapi.json', () => {
    const html = buildSwaggerUiHtml({ specUrl: '/api/openapi.json' });
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain("url: '/api/openapi.json'");
    expect(html).toContain('href="/developers"');
  });

  test('handleOpenApiJson responds with 200 and the OpenAPI 3.1 JSON payload', () => {
    const req = {
      protocol: 'https',
      headers: { host: 'hide-mail.org' },
      get: (header) => (header === 'host' ? 'hide-mail.org' : undefined),
    };
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    handleOpenApiJson(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        openapi: '3.1.0',
        servers: [{ url: 'https://hide-mail.org', description: 'Hide Mail Server' }],
      })
    );
  });

  test('handleSwaggerUi responds with 200 and HTML content', () => {
    const req = {};
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    handleSwaggerUi(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('SwaggerUIBundle'));
  });
});
