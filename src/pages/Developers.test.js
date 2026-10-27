import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Developers from './Developers';

const developersCss = readFileSync(require.resolve('./Developers.css'), 'utf8');

const renderDevelopers = (initialEntry = '/developers') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Developers />
    </MemoryRouter>
  );

describe('Developers API Explorer & MCP Hub page', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('styles dark mode inputs, focus rings, and narrow viewports', () => {
    expect(developersCss).toMatch(
      /body\[data-theme='dark'\] \.developers-key-bar input,\s*body\[data-theme='dark'\] \.developers-textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/
    );
    expect(developersCss).toMatch(/\.developers-page button:focus-visible[\s\S]*outline: 3px solid/);
    expect(developersCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.developers-primary-btn[\s\S]*width: 100%/);
  });

  test('renders the REST API Explorer by default and switches between endpoints and languages', () => {
    renderDevelopers('/developers');

    expect(screen.getByRole('heading', { name: /API Explorer & MCP Hub/i })).toBeInTheDocument();
    expect(screen.getByTestId('developers-api-tab')).toBeInTheDocument();
    expect(screen.getByTestId('api-endpoint-bar')).toHaveTextContent('POSThttps://hide-mail.org/api/mail-grade');

    // Inject API key and verify cURL / JS / Python snippets update live
    fireEvent.change(screen.getByTestId('developers-api-key-input'), {
      target: { value: 'hm_api_test_999' },
    });
    expect(screen.getByTestId('api-code-snippet')).toHaveTextContent('Bearer hm_api_test_999');

    fireEvent.click(screen.getByTestId('snippet-lang-javascript'));
    expect(screen.getByTestId('api-code-snippet')).toHaveTextContent("await fetch('https://hide-mail.org/api/mail-grade'");
    expect(screen.getByTestId('api-code-snippet')).toHaveTextContent('hm_api_test_999');

    fireEvent.click(screen.getByTestId('snippet-lang-python'));
    expect(screen.getByTestId('api-code-snippet')).toHaveTextContent('requests.post(');

    // Switch to QA Mailboxes endpoint and verify sub-routes table renders
    fireEvent.click(screen.getByTestId('endpoint-nav-qa'));
    expect(screen.getByTestId('api-endpoint-bar')).toHaveTextContent('https://hide-mail.org/api/qa/mailboxes');
    expect(screen.getByTestId('api-subroutes')).toHaveTextContent('/api/qa/mailboxes/:email/webhook');
  });

  test('executes a live request in the REST API Try It runner and displays the response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        success: true,
        data: { score: 96, grade: 'A' },
      }),
    });

    renderDevelopers('/developers?endpoint=grade');

    fireEvent.change(screen.getByTestId('developers-api-key-input'), {
      target: { value: 'hm_api_live_123' },
    });
    fireEvent.click(screen.getByTestId('api-send-request'));

    const liveResp = await screen.findByTestId('api-live-response');
    expect(liveResp).toHaveTextContent('HTTP 200 OK');
    expect(liveResp).toHaveTextContent('"grade": "A"');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/mail-grade'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer hm_api_live_123',
        }),
      })
    );
  });

  test('deep-links into the MCP Hub when ?tab=mcp&tool=... is passed', () => {
    renderDevelopers('/developers?tab=mcp&tool=hide_mail_sender_check');

    expect(screen.getByTestId('developers-mcp-tab')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-tool-card-hide_mail_sender_check')).toHaveClass('is-highlighted');
    expect(screen.getByTestId('mcp-rpc-textarea').value).toContain('"name": "hide_mail_sender_check"');
  });

  test('generates client configs for Claude, Cursor, Antigravity, Windsurf, and Stdio CLI and filters MCP tools', () => {
    renderDevelopers('/mcp');

    expect(screen.getByTestId('developers-mcp-tab')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('developers-api-key-input'), {
      target: { value: 'hm_api_agent_key' },
    });

    expect(screen.getByTestId('mcp-config-snippet')).toHaveTextContent('"X-API-Key": "hm_api_agent_key"');

    fireEvent.click(screen.getByTestId('mcp-client-antigravity'));
    expect(screen.getByTestId('mcp-config-snippet')).toHaveTextContent('"serverUrl": "https://hide-mail.org/api/mcp"');

    fireEvent.click(screen.getByTestId('mcp-client-stdio'));
    expect(screen.getByTestId('mcp-config-snippet')).toHaveTextContent('./mcp/hide-mail-mcp.js');
    expect(screen.getByTestId('mcp-config-snippet')).toHaveTextContent('"HIDE_MAIL_API_KEY": "hm_api_agent_key"');

    // Filter tools
    fireEvent.click(screen.getByTestId('mcp-filter-qa'));
    expect(screen.getByTestId('mcp-tool-card-hide_mail_qa_create_mailbox')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-tool-card-hide_mail_grade_email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mcp-filter-suite'));
    expect(screen.getByTestId('mcp-tool-card-hide_mail_grade_email')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-tool-card-hide_mail_qa_create_mailbox')).not.toBeInTheDocument();
  });

  test('sends a live JSON-RPC request in the MCP playground and renders the JSON-RPC result', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'hide_mail_grade_email' }],
        },
      }),
    });

    renderDevelopers('/mcp');

    fireEvent.click(screen.getByTestId('mcp-preset-tools/list'));
    expect(screen.getByTestId('mcp-rpc-textarea').value).toContain('"method": "tools/list"');

    fireEvent.click(screen.getByTestId('mcp-send-rpc'));

    const rpcResp = await screen.findByTestId('mcp-live-response');
    expect(rpcResp).toHaveTextContent('HTTP 200 JSON-RPC OK');
    expect(rpcResp).toHaveTextContent('hide_mail_grade_email');
  });

  test('exposes Swagger UI (/api/docs) and OpenAPI 3.1 JSON (/api/openapi.json) links and spec viewer tab', async () => {
    renderDevelopers('/developers?tab=openapi');

    expect(screen.getByTestId('open-swagger-ui-link')).toHaveAttribute('href', '/api/docs');
    expect(screen.getByTestId('openapi-json-link')).toHaveAttribute('href', '/api/openapi.json');
    expect(screen.getByTestId('developers-openapi-tab')).toBeInTheDocument();
    expect(screen.getByTestId('openapi-spec-preview')).toHaveTextContent('"openapi": "3.1.0"');

    fireEvent.click(screen.getByTestId('openapi-copy-btn'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('"openapi": "3.1.0"')
      );
    });
  });
});
