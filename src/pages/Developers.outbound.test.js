import React from 'react';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Developers from './Developers';
import {
  buildClientOpenApiSpec,
  listCatalogCoveredPaths,
  REST_ENDPOINTS,
} from '../data/developersCatalog';

describe('Developers Outbound Send contracts & MCP auth', () => {
  test('catalog includes Outbound Send integration contract', () => {
    const outbound = REST_ENDPOINTS.find((ep) => ep.id === 'outbound-send');
    expect(outbound).toBeDefined();
    expect(outbound.path).toBe('/api/outbound/messages');
    expect(outbound.authScheme).toBe('sendKey');
    expect(outbound.subRoutes.length).toBeGreaterThan(5);
    expect(outbound.subRoutes.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining([
        'GET /api/outbound/suppressions/export',
        'GET /api/outbound/metrics-token',
      ])
    );
  });

  test('catalog includes Billing & Licenses contracts from Swagger', () => {
    const plans = REST_ENDPOINTS.find((ep) => ep.id === 'billing-plans');
    const issueKey = REST_ENDPOINTS.find((ep) => ep.id === 'billing-api-key');
    expect(plans).toMatchObject({
      method: 'GET',
      path: '/api/billing/plans',
      authScheme: 'none',
      category: 'Billing & Licenses',
    });
    expect(issueKey).toMatchObject({
      method: 'POST',
      path: '/api/billing/license/api-key',
      authScheme: 'none',
      category: 'Billing & Licenses',
    });
    expect(listCatalogCoveredPaths()).toEqual(
      expect.arrayContaining([
        '/api/billing/plans',
        '/api/billing/license/api-key',
        '/api/outbound/suppressions/export',
        '/api/mcp',
      ])
    );
  });

  test('client OpenAPI documents MCP API-key security', () => {
    const spec = buildClientOpenApiSpec();
    expect(spec.paths['/api/mcp'].post.security).toEqual([
      { BearerAuth: [] },
      { ApiKeyHeader: [] },
    ]);
    expect(spec.components.securitySchemes.BearerAuth.bearerFormat).toBe('hm_api_...');
  });

  test('UI exposes Outbound Send nav and send-key placeholder', () => {
    render(
      <MemoryRouter initialEntries={['/developers?endpoint=outbound-send']}>
        <Developers />
      </MemoryRouter>
    );

    expect(screen.getByTestId('endpoint-nav-outbound-send')).toBeInTheDocument();
    expect(screen.getByTestId('api-endpoint-bar')).toHaveTextContent('/api/outbound/messages');
    expect(screen.getByTestId('api-subroutes')).toHaveTextContent('/api/outbound/domains');
    expect(screen.getByTestId('api-subroutes')).toHaveTextContent('/api/outbound/suppressions/export');
    expect(screen.getByTestId('developers-api-key-input')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('hm_send_')
    );

    fireEvent.change(screen.getByTestId('developers-api-key-input'), {
      target: { value: 'hm_send_test_key' },
    });
    expect(screen.getByTestId('api-code-snippet')).toHaveTextContent('Bearer hm_send_test_key');
  });

  test('UI exposes Billing nav and public-endpoint note', () => {
    render(
      <MemoryRouter initialEntries={['/developers?endpoint=billing-plans']}>
        <Developers />
      </MemoryRouter>
    );

    expect(screen.getByTestId('endpoint-nav-billing-plans')).toBeInTheDocument();
    expect(screen.getByTestId('endpoint-nav-billing-api-key')).toBeInTheDocument();
    expect(screen.getByTestId('api-endpoint-bar')).toHaveTextContent('/api/billing/plans');
    expect(screen.getByTestId('developers-public-endpoint-note')).toBeInTheDocument();
    expect(screen.queryByTestId('developers-api-key-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('api-code-snippet')).not.toHaveTextContent('Authorization');
  });
});
