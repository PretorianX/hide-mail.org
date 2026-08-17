/**
 * Request body parsing, kept in one place because the order of the parsers is load bearing.
 *
 * WayForPay posts its webhook as a JSON document but labels the request
 * application/x-www-form-urlencoded. Handed to the generic urlencoded parser, that document
 * becomes a single key with an empty value, the signature field reads as undefined, and every
 * callback is rejected as unsigned. So the webhook body is read as text and decoded as JSON
 * before the generic parsers get a chance to claim it.
 */

const express = require('express');

const WEBHOOK_PATH = '/api/billing/webhook';

const readWebhookText = express.text({ type: '*/*', limit: '64kb' });

const decodeWebhookJson = (req, res, next) => {
  let parsed;
  try {
    parsed = JSON.parse(req.body);
  } catch (error) {
    res.status(400).json({ error: 'JSON body required' });
    return;
  }

  if (!parsed || typeof parsed !== 'object') {
    res.status(400).json({ error: 'JSON body required' });
    return;
  }

  req.body = parsed;
  next();
};

const applyBodyParsers = (app) => {
  app.use(WEBHOOK_PATH, readWebhookText, decodeWebhookJson);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
};

module.exports = { applyBodyParsers, WEBHOOK_PATH };
