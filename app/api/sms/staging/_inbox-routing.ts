// Read-only routing of machine-generated business correspondence.
// Operational alerts stay visible for contract follow-up; they are not
// evidence a prospect requested a sales reply.
export function isDocumentWorkflowNotice(senderDomain:unknown,subject:unknown):boolean {
  const domain=String(senderDomain||'').toLowerCase().trim();
  const title=String(subject||'').slice(0,240);
  if(!/^[a-z0-9.-]{3,120}$/.test(domain))return false;
  // docusign.net is DocuSign's notification sender infrastructure.
  if(/(?:^|\.)docusign\.net$/.test(domain))return true;
  // Do not misclassify a normal person emailing from a company domain.
  return /(?:^|\.)docusign\.com$/.test(domain)&&
    /(?:docusign|electronic signature|please sign|signature request|document to (?:view|sign)|complete with docusign)/i.test(title);
}

/** Third-party lead-form mailboxes are NOT the prospective client's mailbox. */
export function isBizlyMailServiceDomain(senderDomain:unknown):boolean {
  const domain=String(senderDomain||'').toLowerCase().trim();
  return /(?:^|\.)bizlyapp\.com$/.test(domain);
}
export function isAutomatedLeadNotification(senderDomain:unknown,subject:unknown):boolean {
  return isBizlyMailServiceDomain(senderDomain)&&
    /^(?:new\s+(?:contact\s+form|website\s+(?:contact|lead)|corporate\s+(?:poker\s+)?builder)\s+(?:submission|lead)|new\s+.{0,60}\s+lead\s+received)/i.test(String(subject||'').trim());
}

/** Verified from the actual LVPT Gmail conversation, not a name guess. */
export function isVerifiedTalentEmail(address:unknown):boolean {
  return String(address||'').trim().toLowerCase()==='kennajamespoker@gmail.com';
}
