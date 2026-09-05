/**
 * Blockchain Ministries R2 key layout. BUSINESS convention — the platform
 * only guarantees keys are safe, not what they mean.
 */
import { keyspace } from '@reellink/files/r2.js';

export const keys = keyspace({
  publicScroll: (scrollId) => `scrolls/${scrollId}.pdf`,
  memberScroll: (scrollId) => `scrolls-member/${scrollId}.pdf`,
  credential: (ordinationId) => `credentials/${ordinationId}.pdf`,
  ministerPhoto: (ministerId, ext = 'jpg') => `ministers/${ministerId}.${ext}`,
  brand: (name) => `brand/${name}`,
});
