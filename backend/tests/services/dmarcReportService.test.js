const { readReport, DmarcReportError } = require('../../services/dmarcReportService');

const record = ({
  ip,
  count,
  dkim,
  spf,
  disposition,
  from = 'example.com',
}) => `
  <record>
    <row>
      <source_ip>${ip}</source_ip>
      <count>${count}</count>
      <policy_evaluated>
        <disposition>${disposition}</disposition>
        <dkim>${dkim}</dkim>
        <spf>${spf}</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>${from}</header_from>
    </identifiers>
  </record>`;

const feedback = (records, extras = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>${extras.org || 'google.com'}</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>${extras.id || 'rpt-1'}</report_id>
    <date_range>
      <begin>1512345600</begin>
      <end>1512431999</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>${extras.domain || 'example.com'}</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>${extras.policy || 'quarantine'}</p>
    <sp>none</sp>
    <pct>100</pct>
  </policy_published>
  ${records}
</feedback>`;

describe('dmarcReportService', () => {
  it('rejects an empty paste', async () => {
    await expect(readReport('   ')).rejects.toMatchObject({ code: 'REPORT_REQUIRED' });
    await expect(readReport('   ')).rejects.toBeInstanceOf(DmarcReportError);
  });

  it('rejects a document that is not a DMARC aggregate report', async () => {
    await expect(readReport('<note>hello</note>')).rejects.toMatchObject({
      code: 'REPORT_NOT_FEEDBACK',
    });
  });

  it('rejects a doctype so external entities are never expanded', async () => {
    const xml = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><feedback>&xxe;</feedback>`;
    await expect(readReport(xml)).rejects.toMatchObject({ code: 'REPORT_UNREADABLE' });
  });

  it('rejects a report over the size cap', async () => {
    const xml = `<feedback>${'a'.repeat(512 * 1024)}</feedback>`;
    await expect(readReport(xml)).rejects.toMatchObject({ code: 'REPORT_TOO_LARGE' });
  });

  it('summarises a fully aligned report and does not keep the XML or the reporter email', async () => {
    const xml = feedback(record({
      ip: '203.0.113.10',
      count: 8,
      dkim: 'pass',
      spf: 'pass',
      disposition: 'none',
    }));

    const report = await readReport(xml);

    expect(report.stored).toBe(false);
    expect(report.verdict).toBe('Aligned');
    expect(report.domain).toBe('example.com');
    expect(report.orgName).toBe('google.com');
    expect(report.policy).toBe('quarantine');
    expect(report.begin).toBe('2017-12-04');
    expect(report.end).toBe('2017-12-04');
    expect(report.totals).toEqual({ messages: 8, aligned: 8, failed: 0 });
    expect(report.alignedPercent).toBe(100);
    expect(report.sources).toEqual([
      expect.objectContaining({
        sourceIp: '203.0.113.10',
        headerFrom: 'example.com',
        count: 8,
        disposition: 'none',
        dkim: 'pass',
        spf: 'pass',
        aligned: true,
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain('noreply-dmarc-support');
    expect(JSON.stringify(report)).not.toContain('<feedback>');
  });

  it('splits aligned and failing sources and sorts them by volume', async () => {
    const xml = feedback([
      record({
        ip: '198.51.100.4',
        count: 2,
        dkim: 'fail',
        spf: 'fail',
        disposition: 'quarantine',
      }),
      record({
        ip: '203.0.113.10',
        count: 8,
        dkim: 'pass',
        spf: 'fail',
        disposition: 'none',
      }),
    ].join(''));

    const report = await readReport(xml);

    expect(report.verdict).toBe('Mixed');
    expect(report.totals).toEqual({ messages: 10, aligned: 8, failed: 2 });
    expect(report.alignedPercent).toBe(80);
    expect(report.sources.map((source) => source.sourceIp)).toEqual([
      '203.0.113.10',
      '198.51.100.4',
    ]);
    expect(report.sources[1].aligned).toBe(false);
    expect(report.summary).toMatch(/8 of 10/);
  });

  it('calls a report failing when nothing aligned', async () => {
    const xml = feedback(record({
      ip: '198.51.100.4',
      count: 3,
      dkim: 'fail',
      spf: 'fail',
      disposition: 'reject',
    }), { policy: 'reject' });

    const report = await readReport(xml);

    expect(report.verdict).toBe('Failing');
    expect(report.alignedPercent).toBe(0);
    expect(report.policy).toBe('reject');
  });

  it('returns a quiet report when the file has no message rows', async () => {
    const report = await readReport(feedback(''));

    expect(report.verdict).toBe('Quiet');
    expect(report.totals.messages).toBe(0);
    expect(report.sources).toEqual([]);
    expect(report.alignedPercent).toBe(0);
  });

  it('reads a namespaced feedback document', async () => {
    const xml = `<?xml version="1.0"?>
      <x:feedback xmlns:x="urn:dmarc">
        <x:report_metadata>
          <x:org_name>yahoo.com</x:org_name>
          <x:email>dmarc@yahoo.com</x:email>
          <x:report_id>y-1</x:report_id>
          <x:date_range><x:begin>1512345600</x:begin><x:end>1512431999</x:end></x:date_range>
        </x:report_metadata>
        <x:policy_published>
          <x:domain>example.com</x:domain>
          <x:p>none</x:p>
          <x:sp>none</x:sp>
          <x:pct>100</x:pct>
        </x:policy_published>
      </x:feedback>`;

    const report = await readReport(xml);
    expect(report.orgName).toBe('yahoo.com');
    expect(report.verdict).toBe('Quiet');
    expect(JSON.stringify(report)).not.toContain('dmarc@yahoo.com');
  });
});
