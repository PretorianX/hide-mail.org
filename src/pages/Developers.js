import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import {
  REST_ENDPOINTS,
  generateCodeSnippet,
  MCP_CLIENT_CONFIGS,
  MCP_TOOLS,
  MCP_RESOURCES,
  MCP_PROMPTS,
  MCP_RPC_PRESETS,
  OPENAPI_SPEC_PATH,
  SWAGGER_UI_PATH,
  buildClientOpenApiSpec,
} from '../data/developersCatalog';
import './Developers.css';

const API_BASE = (process.env.REACT_APP_API_URL || '/api').replace(/\/+$/, '');
const resolveApiUrl = (apiPath) => `${API_BASE}${String(apiPath || '').replace(/^\/api/, '')}`;

function Developers() {
  const location = useLocation();

  const initialState = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const tabParam = params.get('tab');
    const endpointParam = params.get('endpoint');
    const toolParam = params.get('tool');

    const isMcpRoute =
      location.pathname === '/mcp' ||
      tabParam === 'mcp' ||
      Boolean(toolParam);

    const isOpenApiTab = tabParam === 'openapi' || tabParam === 'swagger';

    const matchedEndpoint =
      REST_ENDPOINTS.find((ep) => ep.id === endpointParam) || REST_ENDPOINTS[0];

    const matchedTool =
      MCP_TOOLS.find((tool) => tool.name === toolParam) || null;

    let resolvedTab = 'api';
    if (isMcpRoute) {
      resolvedTab = 'mcp';
    } else if (isOpenApiTab) {
      resolvedTab = 'openapi';
    }

    return {
      tab: resolvedTab,
      endpointId: matchedEndpoint.id,
      highlightedTool: matchedTool ? matchedTool.name : null,
      initialRpcPayload: matchedTool
        ? JSON.stringify(matchedTool.sampleCall, null, 2)
        : JSON.stringify(MCP_RPC_PRESETS[0].payload, null, 2),
    };
  }, [location.pathname, location.search]);

  const [activeTab, setActiveTab] = useState(initialState.tab);
  const [apiKey, setApiKey] = useState('');

  // REST Explorer state
  const [selectedEndpointId, setSelectedEndpointId] = useState(initialState.endpointId);
  const [codeLang, setCodeLang] = useState('curl');
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [requestBody, setRequestBody] = useState(() => {
    const ep = REST_ENDPOINTS.find((item) => item.id === initialState.endpointId) || REST_ENDPOINTS[0];
    return JSON.stringify(ep.sampleRequest, null, 2);
  });
  const [runnerMode, setRunnerMode] = useState('api'); // 'api' | 'browser'
  const [apiRunning, setApiRunning] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);

  // MCP Hub state
  const [selectedClientId, setSelectedClientId] = useState(MCP_CLIENT_CONFIGS[0].id);
  const [configCopied, setConfigCopied] = useState(false);
  const [toolFilter, setToolFilter] = useState('all');
  const [highlightedTool, setHighlightedTool] = useState(initialState.highlightedTool);
  const [rpcPayload, setRpcPayload] = useState(initialState.initialRpcPayload);
  const [rpcRunning, setRpcRunning] = useState(false);
  const [rpcResponse, setRpcResponse] = useState(null);
  const [openApiCopied, setOpenApiCopied] = useState(false);
  const [openApiSpec, setOpenApiSpec] = useState(null);
  const [openApiLoading, setOpenApiLoading] = useState(false);

  const fetchOpenApiSpec = async () => {
    if (openApiSpec) return openApiSpec;
    if (openApiLoading) return null;
    
    setOpenApiLoading(true);
    try {
      const res = await fetch(resolveApiUrl('/api/openapi.json'));
      const spec = await res.json();
      const specString = JSON.stringify(spec, null, 2);
      setOpenApiSpec(specString);
      return specString;
    } catch {
      // Fallback to client-built spec if backend fetch fails
      const fallback = JSON.stringify(buildClientOpenApiSpec(), null, 2);
      setOpenApiSpec(fallback);
      return fallback;
    } finally {
      setOpenApiLoading(false);
    }
  };

  const handleCopyOpenApi = async () => {
    try {
      const spec = await fetchOpenApiSpec();
      if (spec) {
        await navigator.clipboard?.writeText(spec);
        setOpenApiCopied(true);
        setTimeout(() => setOpenApiCopied(false), 2000);
      }
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleDownloadOpenApi = async () => {
    try {
      const spec = await fetchOpenApiSpec();
      if (spec) {
        const blob = new Blob([spec], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'hide-mail-openapi-3.1.json';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Blob download unavailable
    }
  };

  // Sync when URL query/path changes
  useEffect(() => {
    setActiveTab(initialState.tab);
    setSelectedEndpointId(initialState.endpointId);
    const ep = REST_ENDPOINTS.find((item) => item.id === initialState.endpointId) || REST_ENDPOINTS[0];
    setRequestBody(JSON.stringify(ep.sampleRequest, null, 2));
    setApiResponse(null);
    if (initialState.highlightedTool) {
      setHighlightedTool(initialState.highlightedTool);
      setRpcPayload(initialState.initialRpcPayload);
    }
  }, [initialState]);

  const currentEndpoint = useMemo(
    () => REST_ENDPOINTS.find((ep) => ep.id === selectedEndpointId) || REST_ENDPOINTS[0],
    [selectedEndpointId]
  );

  const handleSelectEndpoint = (endpointId) => {
    const ep = REST_ENDPOINTS.find((item) => item.id === endpointId) || REST_ENDPOINTS[0];
    setSelectedEndpointId(ep.id);
    setRequestBody(JSON.stringify(ep.sampleRequest, null, 2));
    setRunnerMode('api');
    setApiResponse(null);
  };

  const codeSnippet = useMemo(
    () => generateCodeSnippet(currentEndpoint, codeLang, apiKey, requestBody),
    [currentEndpoint, codeLang, apiKey, requestBody]
  );

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard?.writeText(codeSnippet);
      setSnippetCopied(true);
      setTimeout(() => setSnippetCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleRunRestRequest = async (e) => {
    e.preventDefault();
    setApiRunning(true);
    setApiResponse(null);

    const startTime = Date.now();
    let parsedBody;
    try {
      parsedBody = JSON.parse(requestBody);
    } catch (err) {
      setApiRunning(false);
      setApiResponse({
        ok: false,
        status: 400,
        statusText: 'Client JSON Error',
        durationMs: 0,
        body: { error: `Invalid JSON in request body: ${err.message}` },
      });
      return;
    }

    const useBrowserPreview = runnerMode === 'browser' && currentEndpoint.browserPath;
    const targetPath = useBrowserPreview ? currentEndpoint.browserPath : currentEndpoint.path;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (!useBrowserPreview && apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
      headers['X-API-Key'] = apiKey.trim();
    }

    try {
      const res = await fetch(resolveApiUrl(targetPath), {
        method: currentEndpoint.method,
        headers,
        body: JSON.stringify(parsedBody),
      });
      const durationMs = Math.max(1, Date.now() - startTime);
      let data;
      try {
        data = await res.json();
      } catch {
        data = { error: 'Non-JSON response returned by server' };
      }
      setApiResponse({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        targetPath,
        body: data,
      });
    } catch (err) {
      setApiResponse({
        ok: false,
        status: 0,
        statusText: 'Network Error',
        durationMs: Math.max(1, Date.now() - startTime),
        targetPath,
        body: { error: err.message || 'Request failed' },
      });
    } finally {
      setApiRunning(false);
    }
  };

  const currentClientConfig = useMemo(
    () => MCP_CLIENT_CONFIGS.find((c) => c.id === selectedClientId) || MCP_CLIENT_CONFIGS[0],
    [selectedClientId]
  );

  const renderedClientConfig = useMemo(
    () => currentClientConfig.buildConfig(apiKey),
    [currentClientConfig, apiKey]
  );

  const handleCopyMcpConfig = async () => {
    try {
      await navigator.clipboard?.writeText(renderedClientConfig);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const filteredMcpTools = useMemo(() => {
    if (toolFilter === 'suite') {
      return MCP_TOOLS.filter((t) => t.category === 'Deliverability Suite');
    }
    if (toolFilter === 'qa') {
      return MCP_TOOLS.filter((t) => t.category === 'QA Mailboxes');
    }
    return MCP_TOOLS;
  }, [toolFilter]);

  const handleLoadMcpSample = (payloadObj, toolName = null) => {
    setHighlightedTool(toolName);
    setRpcPayload(JSON.stringify(payloadObj, null, 2));
    setRpcResponse(null);
  };

  const handleSendMcpRpc = async (e) => {
    e.preventDefault();
    setRpcRunning(true);
    setRpcResponse(null);

    const startTime = Date.now();
    let parsed;
    try {
      parsed = JSON.parse(rpcPayload);
    } catch (err) {
      setRpcRunning(false);
      setRpcResponse({
        ok: false,
        status: 400,
        durationMs: 0,
        body: {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Invalid JSON: ${err.message}` },
        },
      });
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey.trim()) {
      headers['X-API-Key'] = apiKey.trim();
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    try {
      const res = await fetch(resolveApiUrl('/api/mcp'), {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed),
      });
      const durationMs = Math.max(1, Date.now() - startTime);
      let data;
      try {
        data = await res.json();
      } catch {
        data = { error: 'Non-JSON response from /api/mcp' };
      }
      setRpcResponse({
        ok: res.ok && !data?.error,
        status: res.status,
        durationMs,
        body: data,
      });
    } catch (err) {
      setRpcResponse({
        ok: false,
        status: 0,
        durationMs: Math.max(1, Date.now() - startTime),
        body: {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: err.message || 'Network error' },
        },
      });
    } finally {
      setRpcRunning(false);
    }
  };

  const handleRunMcpDiscovery = async () => {
    setRpcRunning(true);
    setRpcResponse(null);
    const startTime = Date.now();
    const headers = { Accept: 'application/json' };
    if (apiKey.trim()) {
      headers['X-API-Key'] = apiKey.trim();
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }
    try {
      const res = await fetch(resolveApiUrl('/api/mcp'), {
        method: 'GET',
        headers,
      });
      const durationMs = Math.max(1, Date.now() - startTime);
      const data = await res.json();
      setRpcResponse({
        ok: res.ok,
        status: res.status,
        durationMs,
        body: data,
      });
    } catch (err) {
      setRpcResponse({
        ok: false,
        status: 0,
        durationMs: Math.max(1, Date.now() - startTime),
        body: { error: err.message || 'Discovery failed' },
      });
    } finally {
      setRpcRunning(false);
    }
  };

  return (
    <main className="developers-page" data-testid="developers-page">
      <header className="developers-hero">
        <p className="developers-eyebrow">Developer Platform · REST API, OpenAPI 3.1 &amp; Model Context Protocol</p>
        <h1>API Explorer &amp; MCP Hub</h1>
        <p className="developers-lede">
          Every Hide Mail deliverability tool and QA mailbox endpoint in one place. Inspect request and
          response contracts, copy multi-language snippets, execute live API calls, open Swagger UI, or
          connect AI coding agents over the official Model Context Protocol (MCP) server.
        </p>
        <div className="developers-openapi-bar" data-testid="developers-openapi-bar">
          <a
            href={SWAGGER_UI_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="developers-small-btn"
            data-testid="open-swagger-ui-link"
          >
            Open Swagger UI (`/api/docs`) ↗
          </a>
          <a
            href={OPENAPI_SPEC_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="developers-small-btn"
            data-testid="openapi-json-link"
          >
            OpenAPI 3.1 Spec (`/api/openapi.json`) ↗
          </a>
          <button
            type="button"
            className="developers-small-btn"
            onClick={handleDownloadOpenApi}
            data-testid="openapi-download-btn"
          >
            Download `openapi.json`
          </button>
          <button
            type="button"
            className="developers-small-btn"
            onClick={handleCopyOpenApi}
            data-testid="openapi-copy-btn"
          >
            {openApiCopied ? 'Copied OpenAPI 3.1' : 'Copy OpenAPI 3.1 JSON'}
          </button>
        </div>
      </header>

      <section className="developers-topbar" aria-label="Explorer navigation and API key">
        <div className="developers-tabs" role="tablist" aria-label="Developer sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'api'}
            className={`developers-tab-btn${activeTab === 'api' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('api')}
            data-testid="tab-btn-api"
          >
            REST API Explorer ({REST_ENDPOINTS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mcp'}
            className={`developers-tab-btn${activeTab === 'mcp' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('mcp')}
            data-testid="tab-btn-mcp"
          >
            MCP Server &amp; Agent Hub ({MCP_TOOLS.length} tools)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'openapi'}
            className={`developers-tab-btn${activeTab === 'openapi' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('openapi')}
            data-testid="tab-btn-openapi"
          >
            OpenAPI 3.1 / Swagger
          </button>
        </div>

        <div className="developers-key-bar">
          <label htmlFor="developers-api-key">API Key (`hm_api_...`)</label>
          <input
            id="developers-api-key"
            type="text"
            placeholder="hm_live_... (optional for preview)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            data-testid="developers-api-key-input"
          />
          <Link to="/pro" className="developers-key-link">
            Get a key or compare plans →
          </Link>
        </div>
      </section>

      {activeTab === 'api' ? (
        <div className="developers-explorer-grid" data-testid="developers-api-tab">
          <aside className="developers-endpoint-nav" aria-label="REST API Endpoints">
            <p className="developers-nav-heading">Deliverability Suite</p>
            {REST_ENDPOINTS.filter((ep) => ep.category === 'Deliverability Suite').map((ep) => (
              <button
                key={ep.id}
                type="button"
                className={`developers-endpoint-btn${currentEndpoint.id === ep.id ? ' is-selected' : ''}`}
                onClick={() => handleSelectEndpoint(ep.id)}
                data-testid={`endpoint-nav-${ep.id}`}
              >
                <div className="developers-endpoint-btn-top">
                  <span className="developers-method-badge">{ep.method}</span>
                  <span className="developers-endpoint-btn-title">{ep.shortTitle}</span>
                </div>
                <span className="developers-endpoint-btn-path">{ep.path}</span>
              </button>
            ))}

            <p className="developers-nav-heading">QA Automation</p>
            {REST_ENDPOINTS.filter((ep) => ep.category === 'QA Automation').map((ep) => (
              <button
                key={ep.id}
                type="button"
                className={`developers-endpoint-btn${currentEndpoint.id === ep.id ? ' is-selected' : ''}`}
                onClick={() => handleSelectEndpoint(ep.id)}
                data-testid={`endpoint-nav-${ep.id}`}
              >
                <div className="developers-endpoint-btn-top">
                  <span className="developers-method-badge">{ep.method}</span>
                  <span className="developers-endpoint-btn-title">{ep.shortTitle}</span>
                </div>
                <span className="developers-endpoint-btn-path">{ep.path}</span>
              </button>
            ))}
          </aside>

          <div className="developers-detail-panel">
            {/* Endpoint Contract Summary */}
            <article className="developers-card" data-testid="api-contract-card">
              <div className="developers-card-header">
                <h2>{currentEndpoint.title}</h2>
                <div className="developers-meta-pills">
                  {currentEndpoint.authPlans.map((plan) => (
                    <span key={plan} className="developers-pill developers-pill-plan">
                      Plan: {plan}
                    </span>
                  ))}
                  <span className="developers-pill">Rate limit: {currentEndpoint.rateLimit}</span>
                  <span className="developers-pill">Max payload: {currentEndpoint.maxPayload}</span>
                </div>
              </div>

              <div className="developers-endpoint-bar" data-testid="api-endpoint-bar">
                <span className="developers-method-badge">{currentEndpoint.method}</span>
                <code>https://hide-mail.org{currentEndpoint.path}</code>
              </div>

              <p>{currentEndpoint.summary}</p>

              {currentEndpoint.subRoutes && (
                <div data-testid="api-subroutes">
                  <h3>All QA Mailbox &amp; Webhook Routes</h3>
                  <table className="developers-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Route</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentEndpoint.subRoutes.map((route) => (
                        <tr key={`${route.method}-${route.path}`}>
                          <td>
                            <span
                              className={`developers-method-badge method-${route.method.toLowerCase()}`}
                            >
                              {route.method}
                            </span>
                          </td>
                          <td>
                            <code>{route.path}</code>
                          </td>
                          <td>{route.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="developers-cross-links">
                <Link to={currentEndpoint.toolPagePath}>
                  Open interactive {currentEndpoint.shortTitle} tool →
                </Link>
                <button
                  type="button"
                  className="developers-link-btn"
                  onClick={() => {
                    const tool = MCP_TOOLS.find((t) => t.name === currentEndpoint.mcpToolName);
                    setActiveTab('mcp');
                    if (tool) {
                      handleLoadMcpSample(tool.sampleCall, tool.name);
                    }
                  }}
                  data-testid="api-jump-to-mcp"
                >
                  View MCP tool (`{currentEndpoint.mcpToolName}`) →
                </button>
              </div>
            </article>

            {/* Request & Response Schema Tables */}
            <section className="developers-schema-grid">
              <div className="developers-card">
                <h3>Request Body Schema</h3>
                <table className="developers-table" data-testid="api-request-schema">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentEndpoint.requestFields.map((field) => (
                      <tr key={field.name}>
                        <td>
                          <code>{field.name}</code>
                          {field.required && <span className="developers-req-badge">required</span>}
                        </td>
                        <td>
                          <code>{field.type}</code>
                        </td>
                        <td>{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="developers-card">
                <h3>Response Contract (`200 OK`)</h3>
                <table className="developers-table" data-testid="api-response-schema">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentEndpoint.responseFields.map((field) => (
                      <tr key={field.name}>
                        <td>
                          <code>{field.name}</code>
                        </td>
                        <td>
                          <code>{field.type}</code>
                        </td>
                        <td>{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Code Generator & Sample Response */}
            <section className="developers-schema-grid">
              <div className="developers-card">
                <div className="developers-code-toolbar">
                  <div className="developers-lang-tabs" role="tablist" aria-label="Snippet language">
                    {[
                      { id: 'curl', label: 'cURL' },
                      { id: 'javascript', label: 'JavaScript (fetch)' },
                      { id: 'python', label: 'Python (requests)' },
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        className={`developers-small-btn${codeLang === lang.id ? ' is-active' : ''}`}
                        onClick={() => setCodeLang(lang.id)}
                        data-testid={`snippet-lang-${lang.id}`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="developers-small-btn"
                    onClick={handleCopySnippet}
                    data-testid="api-snippet-copy"
                  >
                    {snippetCopied ? 'Copied' : 'Copy snippet'}
                  </button>
                </div>
                <pre className="developers-pre" data-testid="api-code-snippet">
                  <code>{codeSnippet}</code>
                </pre>
              </div>

              <div className="developers-card">
                <div className="developers-code-toolbar">
                  <h3>Sample `200 OK` Payload</h3>
                </div>
                <pre className="developers-pre" data-testid="api-sample-response">
                  <code>{JSON.stringify(currentEndpoint.sampleResponse, null, 2)}</code>
                </pre>
              </div>
            </section>

            {/* Live "Try It" Request Runner */}
            <section className="developers-card" data-testid="api-try-it">
              <div className="developers-card-header">
                <h3>Live API Request Runner</h3>
                <button
                  type="button"
                  className="developers-small-btn"
                  onClick={() => {
                    setRequestBody(JSON.stringify(currentEndpoint.sampleRequest, null, 2));
                    setApiResponse(null);
                  }}
                >
                  Reset sample payload
                </button>
              </div>

              <form onSubmit={handleRunRestRequest}>
                <div className="developers-runner-controls">
                  <div className="developers-mode-switch">
                    <button
                      type="button"
                      className={`developers-small-btn${runnerMode === 'api' ? ' is-active' : ''}`}
                      onClick={() => setRunnerMode('api')}
                      data-testid="runner-mode-api"
                    >
                      Authenticated (`{currentEndpoint.path}`)
                    </button>
                    {currentEndpoint.browserPath && (
                      <button
                        type="button"
                        className={`developers-small-btn${runnerMode === 'browser' ? ' is-active' : ''}`}
                        onClick={() => setRunnerMode('browser')}
                        data-testid="runner-mode-browser"
                      >
                        Free Browser Preview (`{currentEndpoint.browserPath}`)
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="developers-primary-btn"
                    disabled={apiRunning}
                    data-testid="api-send-request"
                  >
                    {apiRunning ? 'Sending request…' : `Send ${currentEndpoint.method} Request`}
                  </button>
                </div>

                <textarea
                  aria-label="Request JSON body"
                  className="developers-textarea"
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  data-testid="api-request-textarea"
                />
              </form>

              { apiResponse && (
                <div data-testid="api-live-response">
                  <div className="developers-response-meta">
                    <span
                      className={
                        apiResponse.ok ? 'developers-status-ok' : 'developers-status-err'
                      }
                    >
                      HTTP {apiResponse.status} {apiResponse.statusText}
                    </span>
                    <span>· {apiResponse.durationMs} ms</span>
                    {apiResponse.targetPath && <span>· {apiResponse.targetPath}</span>}
                  </div>
                  <pre className="developers-pre">
                    <code>{JSON.stringify(apiResponse.body, null, 2)}</code>
                  </pre>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : activeTab === 'openapi' ? (
        <div className="developers-detail-panel" data-testid="developers-openapi-tab">
          <section className="developers-card">
            <div className="developers-card-header">
              <h2>OpenAPI 3.1.0 Specification &amp; Swagger UI</h2>
              <div className="developers-lang-tabs">
                <a
                  href={SWAGGER_UI_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="developers-small-btn"
                >
                  Launch Swagger UI (`/api/docs`) ↗
                </a>
                <a
                  href={OPENAPI_SPEC_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="developers-small-btn"
                >
                  Raw `/api/openapi.json` ↗
                </a>
                <button
                  type="button"
                  className="developers-small-btn"
                  onClick={handleDownloadOpenApi}
                >
                  Download `.json`
                </button>
                <button
                  type="button"
                  className="developers-small-btn"
                  onClick={handleCopyOpenApi}
                >
                  {openApiCopied ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
            </div>
            <p>
              Import <code>https://hide-mail.org/api/openapi.json</code> directly into Postman,
              Insomnia, Bruno, OpenAPI Generator, or Swagger UI at <code>/api/docs</code>.
            </p>
            <pre className="developers-pre" data-testid="openapi-spec-preview">
              <code>{openApiSpec || (openApiLoading ? 'Loading OpenAPI spec...' : 'Click Copy or Download to load the spec')}</code>
            </pre>
          </section>
        </div>
      ) : (
        <div className="developers-detail-panel" data-testid="developers-mcp-tab">
          {/* MCP Overview & Client Config Generator */}
          <section className="developers-schema-grid">
            <article className="developers-card">
              <div className="developers-card-header">
                <h2>Official Hide Mail MCP Server</h2>
                <span className="developers-pill developers-pill-plan">Protocol 2024-11-05</span>
              </div>
              <p>
                Connect Claude Desktop, Claude Code, Cursor, Google Antigravity, Windsurf, or any
                Model Context Protocol client directly to Hide Mail. Your AI agent gets 9 structured
                tools, 2 live reference resources, and 3 guided deliverability prompts.
              </p>

              <div className="developers-endpoint-bar">
                <span className="developers-method-badge">POST</span>
                <code>https://hide-mail.org/api/mcp</code>
              </div>

              <table className="developers-table">
                <thead>
                  <tr>
                    <th>Transport</th>
                    <th>Endpoint / Command</th>
                    <th>Auth</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Streamable HTTP</strong>
                    </td>
                    <td>
                      <code>POST https://hide-mail.org/api/mcp</code>
                    </td>
                    <td>
                      <code>X-API-Key</code> or <code>Bearer</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Discovery / SSE</strong>
                    </td>
                    <td>
                      <code>GET https://hide-mail.org/api/mcp</code>
                    </td>
                    <td>
                      <code>X-API-Key</code> or <code>Bearer</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Local Stdio CLI</strong>
                    </td>
                    <td>
                      <code>node ./mcp/hide-mail-mcp.js</code>
                    </td>
                    <td>
                      <code>HIDE_MAIL_API_KEY</code> env
                    </td>
                  </tr>
                </tbody>
              </table>
            </article>

            <article className="developers-card">
              <div className="developers-code-toolbar">
                <div className="developers-lang-tabs" role="tablist" aria-label="MCP Client">
                  {MCP_CLIENT_CONFIGS.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className={`developers-small-btn${selectedClientId === client.id ? ' is-active' : ''}`}
                      onClick={() => setSelectedClientId(client.id)}
                      data-testid={`mcp-client-${client.id}`}
                    >
                      {client.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="developers-small-btn"
                  onClick={handleCopyMcpConfig}
                  data-testid="mcp-copy-config"
                >
                  {configCopied ? 'Copied' : 'Copy config'}
                </button>
              </div>
              <p className="developers-file-hint">Save to: {currentClientConfig.fileHint}</p>
              <pre className="developers-pre" data-testid="mcp-config-snippet">
                <code>{renderedClientConfig}</code>
              </pre>
            </article>
          </section>

          {/* MCP Tools Catalog */}
          <section className="developers-card" data-testid="mcp-tools-catalog">
            <div className="developers-card-header">
              <h2>MCP Tools Catalog ({MCP_TOOLS.length})</h2>
              <div className="developers-lang-tabs">
                {[
                  { id: 'all', label: `All (${MCP_TOOLS.length})` },
                  { id: 'suite', label: 'Deliverability Suite (5)' },
                  { id: 'qa', label: 'QA Mailboxes (4)' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={`developers-small-btn${toolFilter === filter.id ? ' is-active' : ''}`}
                    onClick={() => setToolFilter(filter.id)}
                    data-testid={`mcp-filter-${filter.id}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="developers-mcp-grid">
              {filteredMcpTools.map((tool) => {
                const properties = tool.inputSchema?.properties || {};
                const requiredList = tool.inputSchema?.required || [];
                const isHighlighted = highlightedTool === tool.name;
                return (
                  <article
                    key={tool.name}
                    className={`developers-mcp-tool-card${isHighlighted ? ' is-highlighted' : ''}`}
                    data-testid={`mcp-tool-card-${tool.name}`}
                  >
                    <div>
                      <h3 className="developers-mcp-tool-name">{tool.name}</h3>
                      <div className="developers-meta-pills">
                        {tool.requiredPlans.map((plan) => (
                          <span key={plan} className="developers-pill developers-pill-plan">
                            {plan}
                          </span>
                        ))}
                      </div>
                      <p className="developers-mcp-tool-desc">{tool.description}</p>
                      <ul className="developers-mcp-schema-list">
                        {Object.entries(properties).map(([propName, propDef]) => (
                          <li key={propName}>
                            <code>{propName}</code> ({propDef.type})
                            {requiredList.includes(propName) && (
                              <span className="developers-req-badge">required</span>
                            )}{' '}
                            — {propDef.description}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="developers-mcp-card-actions">
                      <button
                        type="button"
                        className="developers-small-btn"
                        onClick={() => handleLoadMcpSample(tool.sampleCall, tool.name)}
                        data-testid={`mcp-load-tool-${tool.name}`}
                      >
                        Load in RPC Tester
                      </button>
                      <button
                        type="button"
                        className="developers-link-btn"
                        onClick={() => {
                          handleSelectEndpoint(tool.restEndpointId);
                          setActiveTab('api');
                        }}
                      >
                        REST contract →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* MCP Resources & Prompts */}
          <section className="developers-schema-grid">
            <article className="developers-card" data-testid="mcp-resources-card">
              <h3>MCP Resources ({MCP_RESOURCES.length})</h3>
              <table className="developers-table">
                <thead>
                  <tr>
                    <th>URI &amp; Name</th>
                    <th>Description</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {MCP_RESOURCES.map((res) => (
                    <tr key={res.uri}>
                      <td>
                        <code>{res.uri}</code>
                        <div>{res.name}</div>
                      </td>
                      <td>{res.description}</td>
                      <td>
                        <button
                          type="button"
                          className="developers-small-btn"
                          onClick={() => handleLoadMcpSample(res.sampleRead)}
                        >
                          Test read
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>

            <article className="developers-card" data-testid="mcp-prompts-card">
              <h3>MCP Workflow Prompts ({MCP_PROMPTS.length})</h3>
              <table className="developers-table">
                <thead>
                  <tr>
                    <th>Prompt Name</th>
                    <th>Arguments &amp; Purpose</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {MCP_PROMPTS.map((prompt) => (
                    <tr key={prompt.name}>
                      <td>
                        <code>{prompt.name}</code>
                      </td>
                      <td>
                        <div>{prompt.description}</div>
                        <small>
                          Args:{' '}
                          {prompt.arguments.map((a) => `${a.name}${a.required ? '*' : ''}`).join(', ')}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="developers-small-btn"
                          onClick={() => handleLoadMcpSample(prompt.sampleGet)}
                        >
                          Test prompt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </section>

          {/* Live MCP JSON-RPC Playground */}
          <section className="developers-card" data-testid="mcp-rpc-tester">
            <div className="developers-card-header">
              <h3>Live MCP JSON-RPC 2.0 Playground (`POST /api/mcp`)</h3>
              <div className="developers-lang-tabs">
                {MCP_RPC_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="developers-small-btn"
                    onClick={() => handleLoadMcpSample(preset.payload)}
                    data-testid={`mcp-preset-${preset.id}`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="developers-small-btn"
                  onClick={handleRunMcpDiscovery}
                  data-testid="mcp-discovery-btn"
                >
                  GET /api/mcp (Discovery)
                </button>
              </div>
            </div>

            <form onSubmit={handleSendMcpRpc}>
              <textarea
                aria-label="MCP JSON-RPC payload"
                className="developers-textarea"
                value={rpcPayload}
                onChange={(e) => setRpcPayload(e.target.value)}
                data-testid="mcp-rpc-textarea"
              />
              <button
                type="submit"
                className="developers-primary-btn"
                disabled={rpcRunning}
                data-testid="mcp-send-rpc"
              >
                {rpcRunning ? 'Sending JSON-RPC…' : 'Send JSON-RPC Request'}
              </button>
            </form>

            {rpcResponse && (
              <div data-testid="mcp-live-response">
                <div className="developers-response-meta">
                  <span
                    className={
                      rpcResponse.ok ? 'developers-status-ok' : 'developers-status-err'
                    }
                  >
                    HTTP {rpcResponse.status} {rpcResponse.ok ? 'JSON-RPC OK' : 'JSON-RPC Error'}
                  </span>
                  <span>· {rpcResponse.durationMs} ms</span>
                </div>
                <pre className="developers-pre">
                  <code>{JSON.stringify(rpcResponse.body, null, 2)}</code>
                </pre>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default Developers;
