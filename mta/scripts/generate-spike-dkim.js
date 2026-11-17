'use strict';

// Generates a throwaway RSA keypair for the M0 ZoneMTA spike's DKIM signing test.
// NOT for production use: the private key is written to mta/testdata/dkim.pem,
// which is gitignored, and the identity (selector/domain) is fixed to spike values.
//
// Run with: node mta/scripts/generate-spike-dkim.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SELECTOR = 'spike';
const DOMAIN = 'mail.example.com';
const OUT_DIR = path.join(__dirname, '..', 'testdata');
const OUT_FILE = path.join(OUT_DIR, 'dkim.pem');

function main() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, privateKey, { mode: 0o600 });

    const p = publicKey.toString('base64');

    console.log('selector: %s', SELECTOR);
    console.log('domain: %s', DOMAIN);
    console.log('private key written to: %s', OUT_FILE);
    console.log('DNS TXT record for %s._domainkey.%s:', SELECTOR, DOMAIN);
    console.log('v=DKIM1; k=rsa; p=%s', p);
}

main();
