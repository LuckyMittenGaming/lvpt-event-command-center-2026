'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const gas=fs.readFileSync(path.join(__dirname,
  '../apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs'),'utf8');
const mailbox='book@pokertraininglasvegas.com';
const threadId='aabbccddeeff0011';
const now=Date.now()-60000;
const latestText=[
  'Thank you. This has been submitted.',
  '',
  'From: Las Vegas Poker Training <book@pokertraininglasvegas.com>',
  'Sent: Tuesday, November 10, 2026 10:49 AM',
  'Could you send the PDF invoice?'
].join('\n');
const plain=text=>Buffer.from(text,'utf8').toString('base64url');
const messages=Array.from({length:32},(_,i)=>{
  const last=i===31;
  const body=last?latestText:
    'Earlier event logistics message '+i+'\n'+
    'An earlier paragraph that should not use the entire current email budget. '.repeat(45);
  const sender=last?'kelly@certapro.com':
    i%2===0?mailbox:'kelly@certapro.com';
  const ms=now-(31-i)*120000;
  return {
    id:(500000000+i).toString(16).padStart(16,'0'),
    internalDate:String(ms),
    labelIds:sender===mailbox?['SENT']:['INBOX'],
    payload:{
      mimeType:'text/plain',
      body:{data:plain(body)},
      headers:[
        {name:'From',value:sender},
        {name:'To',value:sender===mailbox?'kelly@certapro.com':mailbox},
        {name:'Subject',value:'Re: CertaPro Painters corporate event'}
      ]
    }
  };
});
let readCalls=0;
const context={
  Utilities:{
    base64DecodeWebSafe(v){return Buffer.from(v,'base64url');},
    newBlob(v){return {getDataAsString(){return Buffer.from(v).toString('utf8');}};}
  },
  Date,Buffer,console
};
vm.createContext(context);
vm.runInContext(gas,context,{filename:'Code.gs',timeout:1000});
context.lvptGmailMetaGet_=url=>{
  readCalls++;
  if(url.endsWith('/profile'))return {emailAddress:mailbox};
  if(url.includes('/threads/'+threadId))return {id:threadId,messages};
  throw Error('Unexpected Gmail API access: '+url);
};
const at=new Date(now).toISOString();
const result=context.lvptReadOnlyBusinessInboxThread_(threadId,at);
assert.equal(result.ok,true,'Read-only history must be retrievable');
assert.equal(result.mailboxIdentityVerified,true);
assert.equal(result.threadId,threadId);
assert.equal(result.totalMessages,32);
assert.equal(result.partial,true,'More than 10 earlier messages must remain marked omitted');
assert.equal(result.messages.length,10);
assert.equal(result.lastMessageAt,at);
assert.equal(result.messages.at(-1).at,at,
  'Newest current message must remain the last chronological item');
assert.equal(result.messages.at(-1).excerpt,'Thank you. This has been submitted.',
  'Current client authored content must never be lost to older quoted messages');
assert.equal(result.messages.at(-1).truncated,false,
  'A short current acknowledgment must not inherit history truncation');
assert.equal(result.messages.at(-1).direction,'inbound');
assert.equal(readCalls,2,'Only business mailbox verification and ONE selected thread read');
assert(result.messages.every(m=>m.excerpt.length<=1100));
assert(result.messages.every((m,i,a)=>!i||a[i-1].at<=m.at),
  'The displayed conversation must remain in chronological order');

const original=context.lvptGmailMetaGet_;
context.lvptGmailMetaGet_=url=>url.endsWith('/profile')?
  {emailAddress:'wsopamatt@gmail.com'}:original(url);
assert.equal(
  context.lvptReadOnlyBusinessInboxThread_(threadId,at).ok,false,
  'Never read the personal mailbox even with a valid thread identifier'
);
console.log('GAS 32-message latest-first read-only excerpt and business-mailbox safety tests passed.');
