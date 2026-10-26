import React, { useEffect, useState } from 'react';
import ReportsService from '../services/ReportsService';
import ReportsOffer from './ReportsOffer';
import './Reports.css';

const MAX_UPLOAD_BYTES = 262144;

const SAMPLE_DMARC_XML = [
  '<?xml version="1.0" encoding="UTF-8" ?>',
  '<feedback>',
  '  <report_metadata>',
  '    <org_name>google.com</org_name>',
  '    <report_id>1512432000.example.com</report_id>',
  '    <date_range>',
  '      <begin>1729814400</begin>',
  '      <end>1729900799</end>',
  '    </date_range>',
  '  </report_metadata>',
  '  <policy_published>',
  '    <domain>example.com</domain>',
  '    <adkim>r</adkim>',
  '    <aspf>r</aspf>',
  '    <p>quarantine</p>',
  '    <sp>quarantine</sp>',
  '    <pct>100</pct>',
  '  </policy_published>',
  '  <record>',
  '    <row>',
  '      <source_ip>203.0.113.10</source_ip>',
  '      <count>42</count>',
  '      <policy_evaluated>',
  '        <disposition>none</disposition>',
  '        <dkim>pass</dkim>',
  '        <spf>pass</spf>',
  '      </policy_evaluated>',
  '    </row>',
  '    <identifiers>',
  '      <header_from>example.com</header_from>',
  '      <envelope_from>bounce.example.com</envelope_from>',
  '    </identifiers>',
  '    <auth_results>',
  '      <dkim>',
  '        <domain>example.com</domain>',
  '        <selector>s2026</selector>',
  '        <result>pass</result>',
  '      </dkim>',
  '      <spf>',
  '        <domain>bounce.example.com</domain>',
  '        <scope>mfrom</scope>',
  '        <result>pass</result>',
  '      </spf>',
  '    </auth_results>',
  '  </record>',
  '  <record>',
  '    <row>',
  '      <source_ip>198.51.100.77</source_ip>',
  '      <count>3</count>',
  '      <policy_evaluated>',
  '        <disposition>quarantine</disposition>',
  '        <dkim>fail</dkim>',
  '        <spf>fail</spf>',
  '      </policy_evaluated>',
  '    </row>',
  '    <identifiers>',
  '      <header_from>example.com</header_from>',
  '      <envelope_from>unaligned-mailer.net</envelope_from>',
  '    </identifiers>',
  '    <auth_results>',
  '      <spf>',
  '        <domain>unaligned-mailer.net</domain>',
  '        <scope>mfrom</scope>',
  '        <result>pass</result>',
  '      </spf>',
  '    </auth_results>',
  '  </record>',
  '</feedback>',
].join('\n');

const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const buildSourcesCsv = (report) => {
  const header = 'source_ip,provider,ptr_host,count,share_percent,disposition,aligned,dkim,spf,header_from,envelope_from';
  const rows = (report?.sources || []).map((source) => [
    source.sourceIp || '',
    source.provider || '',
    source.ptrHost || '',
    source.count ?? 0,
    source.sharePercent ?? '',
    source.disposition || '',
    Boolean(source.aligned),
    source.dkim || '',
    source.spf || '',
    source.headerFrom || '',
    source.envelopeFrom || '',
  ].map(escapeCsvField).join(','));
  return [header, ...rows].join('\n');
};

const readFileAsText = (file) => new Promise((resolve, reject) => {
  if (typeof file.text === 'function') {
    file.text().then(resolve, reject);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read file.'));
  reader.readAsText(file);
});

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  if (typeof file.arrayBuffer === 'function') {
    file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      resolve(window.btoa(binary));
    }, reject);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma === -1 ? result : result.slice(comma + 1));
  };
  reader.onerror = () => reject(new Error('Could not read file.'));
  reader.readAsDataURL(file);
});

const Reports = () => {
  const [xml, setXml] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiedMode, setCopiedMode] = useState(null);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="reports-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!xml.trim()) {
      setReport(null);
      setError('Paste a DMARC aggregate report first.');
      return;
    }
    setBusy(true);
    try {
      const next = await ReportsService.read(xml);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'DMARC Reports could not read that report.');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setReport(null);
      setError('That report is too large.');
      return;
    }

    const lowerName = (file.name || '').toLowerCase();
    const isGz = lowerName.endsWith('.gz') || file.type === 'application/gzip' || file.type === 'application/x-gzip';
    const isZip = lowerName.endsWith('.zip') || file.type === 'application/zip';

    if (isGz || isZip) {
      setBusy(true);
      try {
        const archiveBase64 = await readFileAsBase64(file);
        const format = isGz ? 'gzip' : 'zip';
        const next = await ReportsService.read({ archiveBase64, format });
        if (next) {
          setReport(next);
        }
      } catch (err) {
        setReport(null);
        setError(err.message || 'DMARC Reports could not read that report.');
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const text = await readFileAsText(file);
      if (text.length > MAX_UPLOAD_BYTES) {
        setReport(null);
        setError('That report is too large.');
        return;
      }
      setXml(text);
    } catch (err) {
      setReport(null);
      setError(err.message || 'DMARC Reports could not read that report.');
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    handleFile(file);
  };

  const onDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const onLoadSample = () => {
    setXml(SAMPLE_DMARC_XML);
    setError(null);
  };

  const copyText = async (text, mode) => {
    setCopiedMode(mode);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setTimeout(() => setCopiedMode(null), 2000);
    } catch (_) {
      setCopiedMode(null);
    }
  };

  const onCopyJson = () => {
    if (!report) return;
    copyText(JSON.stringify(report, null, 2), 'json');
  };

  const onCopyCurl = () => {
    const payload = JSON.stringify({ xml: xml.trim() || '<feedback>...</feedback>' });
    const snippet = `curl -X POST https://hide-mail.org/api/dmarc-reports \\\n  -H "X-API-Key: hm_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/'/g, "'\\''")}'`;
    copyText(snippet, 'curl');
  };

  const onExportCsv = () => {
    if (!report) return;
    const csv = buildSourcesCsv(report);
    copyText(csv, 'csv');
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dmarc-sources-${report.domain || 'report'}.csv`;
        link.click();
        if (typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(url);
        }
      }
    } catch (_) {
      // Clipboard copy already succeeded
    }
  };

  const verdict = report?.verdict || null;
  const fill = report ? report.alignedPercent : 0;

  return (
    <main className="reports-page">
      <h1>DMARC Reports</h1>
      <p className="reports-lead">
        Paste a DMARC aggregate report or upload an <code>.xml</code>, <code>.xml.gz</code>, or <code>.zip</code> file.
        You get a source-by-source account of which mail aligned, and what the receiver did with the rest.
      </p>
      <div className="reports-work">
        <div
          className={`reports-volume${verdict ? ` reports-volume-${verdict.toLowerCase()}` : ' reports-volume-empty'}`}
          data-testid="reports-volume"
        >
          <div className="reports-volume-track" aria-hidden="true">
            <div
              className="reports-volume-fill"
              data-testid="reports-volume-fill"
              style={{ width: `${fill}%` }}
            />
          </div>
          <p className="reports-volume-stamp" data-testid="reports-volume-stamp">
            {verdict || '—'}
          </p>
          <p className="reports-volume-count">
            {report ? `${report.totals.aligned} of ${report.totals.messages} aligned` : 'No messages yet'}
          </p>
        </div>
        <form
          className="reports-form"
          onSubmit={onSubmit}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <label htmlFor="reports-xml">Aggregate report</label>
          <textarea
            id="reports-xml"
            value={xml}
            onChange={(event) => setXml(event.target.value)}
            spellCheck="false"
            placeholder={'<?xml version="1.0"?>\n<feedback>\n  <report_metadata>…</report_metadata>\n</feedback>'}
          />
          <div className="reports-upload-row">
            <label htmlFor="reports-file-input" className="reports-upload-label">
              Upload <code>.xml</code>, <code>.xml.gz</code>, or <code>.zip</code> (max 256 KB)
            </label>
            <input
              id="reports-file-input"
              data-testid="reports-file-input"
              type="file"
              accept=".xml,.gz,.zip,application/xml,text/xml,application/gzip,application/zip"
              onChange={onFileChange}
              disabled={busy}
            />
          </div>
          <div className="reports-actions">
            <button type="submit" className="reports-submit" disabled={busy}>
              {busy ? 'Reading…' : 'Read this report'}
            </button>
            <button
              type="button"
              className="reports-sample-btn"
              onClick={onLoadSample}
              disabled={busy}
            >
              Load sample
            </button>
          </div>
          {error ? <p className="reports-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="reports-empty" data-testid="reports-empty">
              Waiting for a report. Nothing you paste is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="reports-result" aria-live="polite" data-testid="reports-result">
          <div className="reports-result-header">
            <h2>
              {report.verdict}
              <span className="reports-score"> {report.domain}</span>
            </h2>
            <div className="reports-export-bar">
              <button
                type="button"
                className="reports-export-btn"
                onClick={onExportCsv}
                data-testid="reports-export-csv"
              >
                {copiedMode === 'csv' ? 'Exported CSV' : 'Export CSV'}
              </button>
              <button
                type="button"
                className="reports-export-btn"
                onClick={onCopyJson}
                data-testid="reports-copy-json"
              >
                {copiedMode === 'json' ? 'Copied JSON' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="reports-export-btn"
                onClick={onCopyCurl}
                data-testid="reports-copy-curl"
              >
                {copiedMode === 'curl' ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
          </div>
          <p>{report.summary}</p>
          <dl className="reports-meta">
            <div>
              <dt>Reporter</dt>
              <dd>{report.orgName}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>
                {report.policy}
                {report.subdomainPolicy && report.subdomainPolicy !== report.policy ? ` (sp=${report.subdomainPolicy})` : ''}
                {typeof report.percent === 'number' && report.percent < 100 ? ` · pct=${report.percent}%` : ''}
              </dd>
            </div>
            {report.adkim || report.aspf ? (
              <div>
                <dt>Alignment mode</dt>
                <dd>adkim={report.adkim || 'r'} / aspf={report.aspf || 'r'}</dd>
              </div>
            ) : null}
            <div>
              <dt>Dates</dt>
              <dd>
                {report.begin} – {report.end}
                {report.windowDays ? ` (${report.windowDays}d)` : ''}
              </dd>
            </div>
            <div>
              <dt>Report id</dt>
              <dd>{report.reportId}</dd>
            </div>
          </dl>
          {report.breakdown ? (
            <section className="reports-detail-card" data-testid="reports-breakdown">
              <h3>Disposition &amp; Alignment Breakdown</h3>
              <dl className="reports-breakdown-grid">
                <div>
                  <dt>Delivered (none)</dt>
                  <dd>{report.breakdown.dispositions?.none ?? 0}</dd>
                </div>
                <div>
                  <dt>Quarantined</dt>
                  <dd>{report.breakdown.dispositions?.quarantine ?? 0}</dd>
                </div>
                <div>
                  <dt>Rejected</dt>
                  <dd>{report.breakdown.dispositions?.reject ?? 0}</dd>
                </div>
                <div>
                  <dt>DKIM aligned</dt>
                  <dd>{report.breakdown.dkimAligned ?? 0}</dd>
                </div>
                <div>
                  <dt>SPF aligned</dt>
                  <dd>{report.breakdown.spfAligned ?? 0}</dd>
                </div>
                <div>
                  <dt>Fully aligned (both)</dt>
                  <dd>{report.breakdown.fullyAligned ?? 0}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {report.sources.length > 0 ? (
            <ul className="reports-sources">
              {report.sources.map((source, index) => (
                <li
                  key={`${source.sourceIp}-${source.headerFrom}-${source.disposition}-${index}`}
                  className={source.aligned === false ? 'reports-source-unaligned' : 'reports-source-aligned'}
                >
                  <strong>{source.sourceIp}</strong>
                  {source.provider ? (
                    <span className="reports-source-provider" data-testid="reports-source-provider">
                      {source.provider}
                    </span>
                  ) : null}
                  {source.ptrHost ? (
                    <span className="reports-source-ptr" data-testid="reports-source-ptr">
                      PTR: {source.ptrHost}
                    </span>
                  ) : null}
                  <span>
                    {source.count} messages
                    {typeof source.sharePercent === 'number' ? ` (${source.sharePercent}%)` : ''}
                  </span>
                  <span>DKIM {source.dkim}</span>
                  <span>SPF {source.spf}</span>
                  <span>{source.disposition}</span>
                  {source.headerFrom || source.envelopeFrom ? (
                    <span className="reports-source-sub">
                      Header-From: {source.headerFrom || '—'}
                      {source.envelopeFrom ? ` · Envelope-From: ${source.envelopeFrom}` : ''}
                    </span>
                  ) : null}
                  {source.authResults && (source.authResults.dkim?.length > 0 || source.authResults.spf?.length > 0) ? (
                    <span className="reports-source-sub">
                      {source.authResults.dkim?.map((d, i) => (
                        <code key={`dkim-${i}`}>
                          dkim:{d.domain || '?'}{d.selector ? `(${d.selector})` : ''}={d.result}
                        </code>
                      ))}
                      {source.authResults.spf?.map((s, i) => (
                        <code key={`spf-${i}`}>
                          spf:{s.domain || '?'}{s.scope ? `(${s.scope})` : ''}={s.result}
                        </code>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="reports-empty">No sources in this report.</p>
          )}
          {Array.isArray(report.recommendations) && report.recommendations.length > 0 ? (
            <section className="reports-detail-card" data-testid="reports-recommendations">
              <h3>Policy &amp; Sender Recommendations</h3>
              <ul className="reports-rec-list">
                {report.recommendations.map((rec, index) => (
                  <li key={rec.id || rec.title || index} className={`reports-rec reports-rec-${rec.severity}`}>
                    <strong>{rec.title}</strong>
                    <span>{rec.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
      <ReportsOffer />
    </main>
  );
};

export default Reports;
