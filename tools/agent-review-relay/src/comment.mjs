import { MARKER, RELAY_REPO } from './constants.mjs';

function pullUrl(pr) {
  return `https://github.com/${RELAY_REPO}/pull/${pr}`;
}

export function renderComment({ decision, rationale, findings, cursorTask, sha, iteration, pr }) {
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
  } else if (decision === 'REQUEST_CHANGES') {
    heading = '### LVPT agent relay — REQUEST_CHANGES';
    extra = [
      `Autonomous correction ${iteration} of 3.`,
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
  if (decision === 'REQUEST_CHANGES' && mentions !== 1) {
    throw new Error('comment mention count rejected');
  }
  if (decision !== 'REQUEST_CHANGES' && mentions !== 0) {
    throw new Error('comment mention count rejected');
  }
  return body;
}
