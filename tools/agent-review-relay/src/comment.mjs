import { MARKER, RELAY_REPO } from './constants.mjs';

function pullUrl(pr) {
  return `https://github.com/${RELAY_REPO}/pull/${pr}`;
}

export function renderComment({ decision, rationale, findings, cursorTask, sha, iteration, pr, maxIterations = 3, handoff = 'mention', agentId = '', runId = '' }) {
  const shortSha = sha.slice(0, 12);
  const url = pullUrl(pr);
  const findingLines = (findings || [])
    .map((finding) => `- \`${finding.path}\`${finding.line ? ` line ${finding.line}` : ''}: ${finding.summary}`)
    .join('\n');
  const shared = [
    `Head \`${shortSha}\`.`,
    '',
    'This status comes from the isolated LVPT review relay, a separate OpenAI API reviewer.',
    'It does not wake a ChatGPT conversation.',
    `A person can continue by opening ${url} in ChatGPT.`,
    '',
    '**Rationale**',
    rationale,
  ];
  if (findingLines) shared.push('', '**Findings**', findingLines);

  let heading = '### LVPT agent relay — HUMAN_APPROVAL_REQUIRED';
  let extra = [];
  if (decision === 'PASS') {
    heading = '### LVPT agent relay — PASS';
    extra = ['The loop has stopped.'];
  } else if (decision === 'REQUEST_CHANGES' && handoff === 'api') {
    heading = '### LVPT agent relay — REQUEST_CHANGES';
    extra = [
      `Autonomous correction ${iteration} of ${maxIterations}.`,
      '',
      'The relay sent this bounded task through the Cursor Cloud Agents API on the current branch of this pull request. It did not open a new pull request.',
      agentId && runId ? `Agent \`${agentId}\`. Run \`${runId}\`.` : 'The handoff was recorded for this dry run and was not sent.',
      'This relay does not enforce a Cursor dollar budget. Set an account spend limit in the Cursor dashboard before enabling the handoff.',
      '',
      cursorTask,
    ];
  } else if (decision === 'REQUEST_CHANGES') {
    heading = '### LVPT agent relay — REQUEST_CHANGES';
    extra = [
      `Autonomous correction ${iteration} of ${maxIterations}.`,
      '',
      '@cursor Please make only this bounded change on the staging pull request. Do not merge, deploy, change production, or expand the task.',
      '',
      cursorTask,
    ];
  } else {
    extra = ['The loop has stopped. A person needs to decide before any further agent changes.'];
  }

  const body = [heading, '', ...extra, '', ...shared, '', `<!-- ${MARKER} decision=${decision} sha=${sha} iteration=${iteration} -->`].join('\n');
  const mentions = body.split('@cursor').length - 1;
  const expectMention = decision === 'REQUEST_CHANGES' && handoff !== 'api';
  if (expectMention && mentions !== 1) throw new Error('comment mention count rejected');
  if (!expectMention && mentions !== 0) throw new Error('comment mention count rejected');
  return body;
}
