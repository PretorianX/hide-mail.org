const logger = require('../utils/logger');
const metrics = require('../services/metricsService');
const restoreKeyService = require('../services/restoreKeyService');

const MAILBOX_GONE = {
  success: false,
  error: 'This inbox is no longer active, so it cannot be reopened.',
  code: 'MAILBOX_NOT_ACTIVE',
};

/**
 * A malformed key and an unknown key get the same answer. Telling them apart would let someone
 * probe the key format for free.
 */
const KEY_UNKNOWN = {
  success: false,
  error: 'That restore key does not match a live inbox. It may have expired.',
  code: 'RESTORE_KEY_UNKNOWN',
};

const expiryOf = (ttlSeconds) => new Date(Date.now() + ttlSeconds * 1000).toISOString();

const requireMailbox = (req, res) => {
  const email = req.body?.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ success: false, error: 'Invalid email address' });
    return null;
  }
  return email;
};

const restoreKeyController = {
  /**
   * Issue, or re-show, the restore key of an active mailbox. `rotate` replaces it.
   */
  async issue(req, res, next) {
    const email = requireMailbox(req, res);
    if (!email) {
      return undefined;
    }

    try {
      const { key, ttlSeconds, created } = await restoreKeyService.issue(email, {
        rotate: Boolean(req.body?.rotate),
      });

      if (created) {
        metrics.restoreKeysIssuedTotal.inc();
      }

      return res.status(200).json({
        success: true,
        data: { key, email, ttlSeconds, expiresAt: expiryOf(ttlSeconds) },
      });
    } catch (error) {
      if (error.message === 'MAILBOX_NOT_ACTIVE') {
        return res.status(404).json(MAILBOX_GONE);
      }
      logger.error('Error issuing restore key:', error);
      return next(error);
    }
  },

  /**
   * Exchange a restore key for the mailbox it points at.
   */
  async redeem(req, res, next) {
    try {
      const resolved = await restoreKeyService.redeem(req.body?.key);

      if (!resolved) {
        metrics.restoreKeysRedeemedTotal.inc({ result: 'unknown' });
        return res.status(404).json(KEY_UNKNOWN);
      }

      metrics.restoreKeysRedeemedTotal.inc({ result: 'ok' });

      return res.status(200).json({
        success: true,
        data: {
          email: resolved.email,
          ttlSeconds: resolved.ttlSeconds,
          expiresAt: expiryOf(resolved.ttlSeconds),
        },
      });
    } catch (error) {
      logger.error('Error redeeming restore key:', error);
      return next(error);
    }
  },

  /**
   * Drop the key without touching the mailbox.
   */
  async revoke(req, res, next) {
    const email = requireMailbox(req, res);
    if (!email) {
      return undefined;
    }

    try {
      const revoked = await restoreKeyService.revoke(email);
      return res.status(200).json({ success: true, data: { revoked } });
    } catch (error) {
      logger.error('Error revoking restore key:', error);
      return next(error);
    }
  },
};

module.exports = restoreKeyController;
