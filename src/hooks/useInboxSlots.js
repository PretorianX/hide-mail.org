import { useCallback, useEffect, useState } from 'react';
import InboxSlotService from '../services/InboxSlotService';

// The remaining time shown on each chip is a glance, not a countdown, so re-reading the set twice
// a minute is enough and stays far inside the inboxSlots rate limit.
const REFRESH_INTERVAL_MS = 30000;

/**
 * The concurrent inboxes this browser holds, kept in step with the server. The server is the only
 * thing that knows which leases are still alive, so nothing is derived locally.
 *
 * @param {?string} activeEmail - Address currently being read; re-reads the set when it changes
 */
const useInboxSlots = (activeEmail) => {
  const [slots, setSlots] = useState([]);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const { slots: live, limit: allowance } = await InboxSlotService.list();
      setSlots(live);
      setLimit(allowance);
    } catch (readError) {
      // The strip is an aid, not the inbox. If the set cannot be read it is hidden rather than
      // guessed at, and the page keeps working on the address it already has.
      console.error('Could not read the inbox slots:', readError);
      setSlots([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, activeEmail]);

  useEffect(() => {
    const interval = setInterval(reload, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reload]);

  return { slots, limit, error, setError, reload };
};

export default useInboxSlots;
