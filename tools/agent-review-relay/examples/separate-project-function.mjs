// The deployable route is ../api/webhook.js.
// Point a separate Vercel project at tools/agent-review-relay.
// Do not copy this into the command center app/api tree.

export { default, handleNodeRequest } from '../api/webhook.js';
