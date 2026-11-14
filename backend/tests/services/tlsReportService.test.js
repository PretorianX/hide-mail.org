const { readTlsReport, TlsReportError } = require('../../services/tlsReportService');

const report = (overrides = {}) => JSON.stringify({
  'organization-name': 'Company-X',
  'date-range': {
    'start-datetime': '2016-04-01T00:00:00Z',
    'end-datetime': '2016-04-01T23:59:59Z',
  },
  'contact-info': 'sts-reporting@company-x.example',
  'report-id': '5065427c-23d3-47ca-b6e0-946ea0e8c4be',
  policies: [
    {
      policy: {
        'policy-type': 'sts',
        'policy-string': ['version: STSv1', 'mode: testing'],
        'policy-domain': 'Company-Y.Example',
        'mx-host': ['*.company-y.example'],
      },
      summary: {
        'total-successful-session-count': 5326,
        'total-failure-session-count': 303,
      },
      'failure-details': [
        {
          'result-type': 'certificate-expired',
          'sending-mta-ip': '2001:db8:abcd:12::1',
          'receiving-mx-hostname': 'mx1.company-y.example',
          'receiving-ip': '2001:db8:abcd:13::1',
          'failed-session-count': 100,
        },
        {
          'result-type': 'starttls-not-supported',
          'sending-mta-ip': '2001:db8:abcd:13::1',
          'receiving-mx-hostname': 'mx2.company-y.example',
          'receiving-ip': '2001:db8:abcd:14::1',
          'failed-session-count': 200,
        },
      ],
    },
  ],
  'secret-note': 'do-not-echo',
  ...overrides,
});

const expectCode = (source, code) => {
  try {
    readTlsReport(source);
  } catch (error) {
    expect(error).toBeInstanceOf(TlsReportError);
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('TLS Reports', () => {
  it('stamps the host with the most failed sessions and drops unknown fields', () => {
    const result = readTlsReport(report());

    expect(result.stored).toBe(false);
    expect(result.stamp).toBe('FAILURES');
    expect(result.verdict).toBe('failures');
    expect(result.organization).toBe('Company-X');
    expect(result.reportId).toBe('5065427c-23d3-47ca-b6e0-946ea0e8c4be');
    expect(result.successfulSessions).toBe(5326);
    expect(result.failedSessions).toBe(303);
    expect(result.summary).toBe(
      '303 sessions failed TLS. mx2.company-y.example did not offer STARTTLS.'
    );
    expect(result.policies).toEqual([
      {
        domain: 'company-y.example',
        policyType: 'sts',
        policyLabel: 'MTA-STS',
        mode: 'testing',
        mxHosts: ['*.company-y.example'],
        successfulSessions: 5326,
        failedSessions: 303,
        failures: [
          {
            resultType: 'certificate-expired',
            reason: 'The certificate had expired.',
            receivingHost: 'mx1.company-y.example',
            receivingIp: '2001:db8:abcd:13::1',
            sendingIp: '2001:db8:abcd:12::1',
            failedSessions: 100,
          },
          {
            resultType: 'starttls-not-supported',
            reason: 'The receiving host did not offer STARTTLS.',
            receivingHost: 'mx2.company-y.example',
            receivingIp: '2001:db8:abcd:14::1',
            sendingIp: '2001:db8:abcd:13::1',
            failedSessions: 200,
          },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('do-not-echo');
  });

  it('stamps a report with no failed sessions as clear', () => {
    const source = report({
      policies: [
        {
          policy: {
            'policy-type': 'tlsa',
            'policy-string': ['mode: enforce'],
            'policy-domain': 'dane.example',
            'mx-host': ['mx.dane.example'],
          },
          summary: {
            'total-successful-session-count': 10,
            'total-failure-session-count': 0,
          },
        },
      ],
    });

    const result = readTlsReport(source);

    expect(result.stamp).toBe('CLEAR');
    expect(result.verdict).toBe('clear');
    expect(result.summary).toBe('Every counted session negotiated TLS.');
    expect(result.policies[0].policyLabel).toBe('DANE');
    expect(result.policies[0].mode).toBe('enforce');
    expect(result.policies[0].failures).toEqual([]);
  });

  it('stamps a report that counted no sessions as empty', () => {
    const source = report({
      policies: [
        {
          policy: {
            'policy-type': 'no-policy-found',
            'policy-string': [],
            'policy-domain': 'new.example',
            'mx-host': [],
          },
          summary: {
            'total-successful-session-count': 0,
            'total-failure-session-count': 0,
          },
          'failure-details': [],
        },
      ],
    });

    const result = readTlsReport(source);

    expect(result.stamp).toBe('EMPTY');
    expect(result.verdict).toBe('empty');
    expect(result.summary).toBe('The report counted no SMTP sessions.');
    expect(result.policies[0].policyLabel).toBe('No policy');
  });

  it('rejects an empty paste, a message, XML, and gzip', () => {
    expectCode('  ', 'EMPTY_TLS_REPORT');
    expectCode('From: Ada <ada@example.com>\n\nHi', 'NOT_A_TLS_REPORT');
    expectCode('<feedback><report_metadata/></feedback>', 'NOT_A_TLS_REPORT');
    expectCode(Buffer.from([0x1f, 0x8b, 0x08, 0x00]).toString('binary'), 'UNZIP_TLS_REPORT');
  });

  it('rejects JSON that is not an SMTP TLS report', () => {
    expectCode('[]', 'NOT_A_TLS_REPORT');
    expectCode('{"organization-name":"X"}', 'NOT_A_TLS_REPORT');
    expectCode(report({
      policies: [
        {
          policy: {
            'policy-type': 'spf',
            'policy-string': [],
            'policy-domain': 'example.com',
            'mx-host': [],
          },
          summary: {
            'total-successful-session-count': 1,
            'total-failure-session-count': 0,
          },
        },
      ],
    }), 'NOT_A_TLS_REPORT');
  });

  it('rejects a report larger than 64 KB', () => {
    expectCode(`{"pad":"${'x'.repeat(64 * 1024)}"}`, 'TLS_TOO_LARGE');
  });
});
