const zlib = require('node:zlib');
const {
  readReport,
  extractXmlFromArchive,
  DmarcReportError,
  PTR_CONCURRENCY,
  MAX_PTR_UNIQUE_IPS,
  PTR_TIMEOUT_MS,
} = require('../../services/dmarcReportService');

const buildZipBuffer = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach(({ name, data, method = 8 }) => {
    const nameBuf = Buffer.from(name, 'utf8');
    const uncompressed = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compressed = method === 8 ? zlib.deflateRawSync(uncompressed) : uncompressed;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  });

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
};

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

  it('keeps an explicit pct of 0', async () => {
    const xml = feedback('').replace('<pct>100</pct>', '<pct>0</pct>');
    const report = await readReport(xml);
    expect(report.percent).toBe(0);
  });

  it('defaults a missing pct to 100', async () => {
    const xml = feedback('').replace('<pct>100</pct>', '');
    const report = await readReport(xml);
    expect(report.percent).toBe(100);
    expect(report.verdict).toBe('Quiet');
  });

  it('rejects a pct above 100', async () => {
    const xml = feedback('').replace('<pct>100</pct>', '<pct>150</pct>');
    await expect(readReport(xml)).rejects.toMatchObject({ code: 'REPORT_UNREADABLE' });
  });

  it('rejects a document nested deeper than a DMARC report', async () => {
    const nested = `${'<wrap>'.repeat(40)}<feedback/>${'</wrap>'.repeat(40)}`;
    await expect(readReport(nested)).rejects.toBeInstanceOf(DmarcReportError);
    await expect(readReport(nested)).rejects.toMatchObject({ code: 'REPORT_UNREADABLE' });
  });

  describe('archive extraction (.xml.gz and .zip)', () => {
    it('extracts and reads a gzipped DMARC XML report', async () => {
      const xml = feedback(record({
        ip: '203.0.113.10',
        count: 5,
        dkim: 'pass',
        spf: 'pass',
        disposition: 'none',
      }));
      const gzBase64 = zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');

      const extracted = extractXmlFromArchive(gzBase64, 'gzip');
      expect(extracted).toContain('<feedback>');

      const report = await readReport({ archiveBase64: gzBase64, format: 'gzip' });
      expect(report.totals).toEqual({ messages: 5, aligned: 5, failed: 0 });
    });

    it('extracts the first .xml entry from a deflated or stored .zip archive', async () => {
      const xml = feedback(record({
        ip: '203.0.113.10',
        count: 3,
        dkim: 'pass',
        spf: 'pass',
        disposition: 'none',
      }));
      const zipBuf = buildZipBuffer([
        { name: 'readme.txt', data: 'ignore me', method: 0 },
        { name: 'google.com!example.com!1512345600!1512431999.xml', data: xml, method: 8 },
      ]);

      const extracted = extractXmlFromArchive(zipBuf.toString('base64'), 'zip');
      expect(extracted).toContain('<feedback>');

      const report = await readReport({ archiveBase64: zipBuf.toString('base64'), format: 'zip' });
      expect(report.totals).toEqual({ messages: 3, aligned: 3, failed: 0 });
    });

    it('enforces a strict 256 KB decompression cap on .gz and .zip archives', () => {
      const oversizedXml = `<feedback>${'a'.repeat(270 * 1024)}</feedback>`;
      const gzBomb = zlib.gzipSync(Buffer.from(oversizedXml, 'utf8')).toString('base64');
      expect(() => extractXmlFromArchive(gzBomb, 'gzip')).toThrow(
        expect.objectContaining({ code: 'REPORT_TOO_LARGE' })
      );

      const zipBomb = buildZipBuffer([
        { name: 'huge.xml', data: oversizedXml, method: 8 },
      ]).toString('base64');
      expect(() => extractXmlFromArchive(zipBomb, 'zip')).toThrow(
        expect.objectContaining({ code: 'REPORT_TOO_LARGE' })
      );
    });
  });

  describe('PTR reverse DNS and ESP attribution', () => {
    it('attributes known ESPs from PTR hostnames and auth_results / envelope domains', async () => {
      const xml = feedback([
        record({
          ip: '209.85.220.41',
          count: 10,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '40.107.20.50',
          count: 6,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '54.240.8.1',
          count: 4,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '198.51.100.99',
          count: 2,
          dkim: 'fail',
          spf: 'fail',
          disposition: 'reject',
        }),
      ].join(''));

      const fakeDns = {
        reverse: jest.fn(async (ip) => {
          const map = {
            '209.85.220.41': ['mail-sor-f41.google.com.'],
            '40.107.20.50': ['mail-bn8nam11on2050.outbound.protection.outlook.com'],
            '54.240.8.1': ['a8-1.smtp-out.amazonses.com'],
          };
          if (map[ip]) return map[ip];
          const err = new Error('not found');
          err.code = 'ENOTFOUND';
          throw err;
        }),
      };

      const report = await readReport(xml, { dns: fakeDns });
      const byIp = Object.fromEntries(report.sources.map((s) => [s.sourceIp, s]));

      expect(byIp['209.85.220.41']).toEqual(expect.objectContaining({
        ptrHost: 'mail-sor-f41.google.com',
        provider: 'Google Workspace',
      }));
      expect(byIp['40.107.20.50']).toEqual(expect.objectContaining({
        ptrHost: 'mail-bn8nam11on2050.outbound.protection.outlook.com',
        provider: 'Microsoft 365',
      }));
      expect(byIp['54.240.8.1']).toEqual(expect.objectContaining({
        ptrHost: 'a8-1.smtp-out.amazonses.com',
        provider: 'Amazon SES',
      }));
      expect(byIp['198.51.100.99']).toEqual(expect.objectContaining({
        ptrHost: null,
        provider: null,
      }));
    });

    it('caps concurrent PTR lookups and unique IPs resolved per report', async () => {
      const ipCount = MAX_PTR_UNIQUE_IPS + 20;
      const uniqueXml = feedback(Array.from({ length: ipCount }, (_, i) => {
        const a = 8 + Math.floor(i / 65025);
        const b = Math.floor((i % 65025) / 255);
        const c = i % 255;
        return record({
          ip: `${a}.${b}.${c}.10`,
          count: 1,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        });
      }).join(''));

      let inFlight = 0;
      let peakInFlight = 0;
      const fakeDns = {
        reverse: jest.fn(async (ip) => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 15));
          inFlight -= 1;
          return [`host-${ip.replace(/\./g, '-')}.example.com`];
        }),
      };

      const report = await readReport(uniqueXml, { dns: fakeDns });

      expect(fakeDns.reverse).toHaveBeenCalledTimes(MAX_PTR_UNIQUE_IPS);
      expect(peakInFlight).toBeLessThanOrEqual(PTR_CONCURRENCY);
      expect(peakInFlight).toBeGreaterThan(1);

      const resolved = report.sources.filter((s) => s.ptrHost);
      const unresolved = report.sources.filter((s) => s.ptrHost === null);
      expect(resolved).toHaveLength(MAX_PTR_UNIQUE_IPS);
      expect(unresolved).toHaveLength(ipCount - MAX_PTR_UNIQUE_IPS);
    });

    it('skips PTR for link-local, CGNAT, and IPv6 source IPs', async () => {
      const xml = feedback([
        record({
          ip: '169.254.10.20',
          count: 2,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '100.64.1.5',
          count: 2,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '2001:db8::1',
          count: 2,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '::ffff:8.8.8.8',
          count: 2,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
        record({
          ip: '8.8.8.8',
          count: 1,
          dkim: 'pass',
          spf: 'pass',
          disposition: 'none',
        }),
      ].join(''));

      const fakeDns = {
        reverse: jest.fn(async () => ['dns.google']),
      };

      const report = await readReport(xml, { dns: fakeDns });
      const byIp = Object.fromEntries(report.sources.map((s) => [s.sourceIp, s]));

      expect(fakeDns.reverse).toHaveBeenCalledTimes(1);
      expect(fakeDns.reverse).toHaveBeenCalledWith('8.8.8.8');
      expect(byIp['169.254.10.20'].ptrHost).toBeNull();
      expect(byIp['100.64.1.5'].ptrHost).toBeNull();
      expect(byIp['2001:db8::1'].ptrHost).toBeNull();
      expect(byIp['::ffff:8.8.8.8'].ptrHost).toBeNull();
      expect(byIp['8.8.8.8'].ptrHost).toBe('dns.google');
    });

    it('does not crash or leave unhandled rejections when reverse times out', async () => {
      const xml = feedback(record({
        ip: '8.8.4.4',
        count: 1,
        dkim: 'pass',
        spf: 'pass',
        disposition: 'none',
      }));

      const unhandled = [];
      const onUnhandled = (reason) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      const fakeDns = {
        reverse: jest.fn(() => new Promise((resolve) => {
          // Resolve after the PTR timeout so Promise.race takes the timeout path;
          // the late settle must not surface as an unhandled rejection.
          setTimeout(() => resolve(['late.example.com']), PTR_TIMEOUT_MS + 80);
        })),
      };

      try {
        const report = await readReport(xml, { dns: fakeDns });
        expect(report.sources[0].ptrHost).toBeNull();
        await new Promise((resolve) => setTimeout(resolve, PTR_TIMEOUT_MS + 120));
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });
});
