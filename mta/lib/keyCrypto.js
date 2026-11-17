'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function decrypt(encoded, secret) {
    const parts = encoded.split(':');
    if (parts.length !== 4 || parts[0] !== 'gcm') {
        throw new Error('Invalid encrypted value format');
    }

    const [, ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        deriveKey(secret),
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    return Buffer.concat([
        decipher.update(Buffer.from(cipherHex, 'hex')),
        decipher.final()
    ]).toString('utf8');
}

module.exports = {
    decrypt
};
