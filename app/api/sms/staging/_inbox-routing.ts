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
