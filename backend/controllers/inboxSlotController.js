const logger = require('../utils/logger');
const metrics = require('../services/metricsService');
const entitlementService = require('../services/entitlementService');
const inboxSlotService = require('../services/inboxSlotService');
const redisService = require('../services/redisService');
const { createGroupId, groupIdFromHeaders } = require('../utils/inboxGroupId');

const requireGroup = (req, res) => {
  const groupId = groupIdFromHeaders(req.headers);
  if (!groupId) {
    res.status(400).json({
      success: false,
      error: 'This request needs an inbox group. Ask for one first.',
      code: 'INBOX_GROUP_REQUIRED',
    });
    return null;
  }
  return groupId;
};

const entitlementsOf = (req) =>
  req.entitlements || entitlementService.getEntitlements(req.license);

const inboxSlotController = {
  /**
   * Mint an inbox group for a browser. The id is the only handle on a set of concurrent inboxes,
   * so it is generated here rather than accepted from the client.
   */
  async createGroup(req, res, next) {
    try {
      const entitlements = entitlementsOf(req);

      res.status(200).json({
        success: true,
        data: {
          groupId: createGroupId(),
          limit: entitlements.inboxSlots,
          planType: entitlements.planType,
        },
      });
    } catch (error) {
      logger.error('Error creating inbox group:', error);
      next(error);
    }
  },

  /**
   * The inboxes a group still holds, with the allowance that sizes it.
   */
  async listSlots(req, res, next) {
    try {
      const groupId = requireGroup(req, res);
      if (!groupId) {
        return undefined;
      }

      const entitlements = entitlementsOf(req);
      const slots = await inboxSlotService.listSlots(groupId);

      return res.status(200).json({
        success: true,
        data: {
          slots,
          used: slots.length,
          limit: entitlements.inboxSlots,
          planType: entitlements.planType,
        },
      });
    } catch (error) {
      logger.error('Error listing inbox slots:', error);
      return next(error);
    }
  },

  /**
   * Close one inbox of the group. The slot is checked before the lease is dropped, so this can
   * never deactivate a mailbox belonging to someone else.
   */
  async releaseSlot(req, res, next) {
    try {
      const groupId = requireGroup(req, res);
      if (!groupId) {
        return undefined;
      }

      const { email } = req.params;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Invalid email address' });
      }

      try {
        await inboxSlotService.releaseSlot(groupId, email);
      } catch (error) {
        if (error.code === 'SLOT_NOT_FOUND') {
          return res.status(404).json({
            success: false,
            error: error.message,
            code: error.code,
          });
        }
        throw error;
      }

      await redisService.deactivateMailbox(email);
      metrics.mailboxesDeactivatedTotal.inc();
      metrics.inboxSlotsReleasedTotal.inc();

      return res.status(200).json({
        success: true,
        message: 'Inbox closed',
        data: { email },
      });
    } catch (error) {
      logger.error('Error releasing inbox slot:', error);
      return next(error);
    }
  },
};

module.exports = inboxSlotController;
