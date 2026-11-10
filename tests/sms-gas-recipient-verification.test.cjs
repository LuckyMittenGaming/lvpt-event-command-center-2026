'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const gas=fs.readFileSync(path.join(__dirname,
  '../apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs'),'utf8');
const mailbox='book@pokertraininglasvegas.com',external='client@example.com';
const threadId='aabbccddeeff0011';
const at=new Date(Date.now()-60000).toISOString();
const make=(from,headers={},labels=['INBOX'])=>({
  id:'0011223344556677',internalDate:String(Date.parse(at)),
  labelIds:labels,
  payload:{
    mimeType:'text/plain',
    body:{data:Buffer.from('Could you send event dates and pricing?','utf8').toString('base64url')},
    headers:[
      {name:'From',value:from},
      {name:'To',value:mailbox},
      {name:'Subject',value:'Poker training event inquiry'},
      {name:'Message-ID',value:'<client-inquiry-1@example.com>'},
      ...Object.entries(headers).map(([name,value])=>({name,value}))
    ]
  }
});
let messages=[make(external)],senderProfile=mailbox,reads=[];
const context={
  Date,Buffer,console,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  Utilities:{
    base64DecodeWebSafe:v=>Buffer.from(v,'base64url'),
    newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})
  }
};
vm.createContext(context);
vm.runInContext(gas,context,{filename:'Code.gs',timeout:1000});
context.lvptGmailMetaGet_=url=>{
  reads.push(url);
  if(url.endsWith('/profile'))return {emailAddress:senderProfile};
  if(url.includes('/threads/'+threadId))return {id:threadId,messages};
  throw Error('Unexpected Gmail API lookup');
};
let result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,true);
assert.equal(result.mailboxIdentityVerified,true);
assert.equal(result.source,'verified_lvpt_gmail_reply_recipient');
assert.equal(result.recipient,external);
assert.equal(result.subject,'Poker training event inquiry');
assert.equal(result.inReplyTo,'<client-inquiry-1@example.com>');
assert.equal(result.sendingEnabled,false,'The GAS sender switch is OFF by default');
assert(reads.every(url=>!url.includes('/messages/send')),'No Gmail writes');
assert.equal(reads.length,4,'Only mailbox and selected-thread lookups allowed');
assert.equal(context.lvptStep48SendApprovedReply_({intentId:'00000000-0000-4000-8000-000000000000'}).ok,false,
  'Even a simulated send cannot proceed with GAS switch disabled');

messages=[make(external,{'Reply-To':'another@example.com'})];
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,'A mismatched Reply-To must be rejected');

messages=[make(external,{'Reply-To':external})];
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,true,'Matching Reply-To may be used');

messages=[make('no-reply@example.com')];
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,'Automated sender cannot be verified');

messages=[make('tommy@venetianlasvegas.com')];
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,'Venue/vendor correspondence must not be authorized as client sales');

messages=[make(external,{},['INBOX','SENT'])];
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,'Outgoing or SENT-labeled email is not a new client request');

messages=[make(external)];
senderProfile='wsopamatt@gmail.com';
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,'Personal Gmail must never impersonate LVPT');
senderProfile=mailbox;

messages=Array.from({length:32},(_,i)=>({
  ...make(external),
  id:(1000000000+i).toString(16).padStart(16,'0'),
  internalDate:String(Date.parse(at)-(31-i)*120000)
}));
result=context.lvptStep48VerifyReplyRecipient_(threadId,at);
assert.equal(result.ok,false,
  'Long thread recipient verification remains fail-closed until owner explicitly reviews full history');
console.log('Step 48 GAS read-only sender verification and disabled-send safety behavior passed.');
