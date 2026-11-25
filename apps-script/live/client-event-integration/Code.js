/**
 * Las Vegas Poker Training — Client Event Portal Email Receiver
 *
 * Deploy this Google Apps Script as a Web App while logged in as:
 * book@pokertraininglasvegas.com
 *
 * Deployment:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The LVPT portal sends selection data plus permanent Vercel Blob image URLs.
 * This script fetches those images, embeds them inline in two HTML emails,
 * and sends:
 *   1) Internal submission -> book@pokertraininglasvegas.com
 *   2) Client confirmation -> submitted client email
 */

const LVPT_INTERNAL_EMAIL = 'book@pokertraininglasvegas.com';
const LVPT_SENDER_NAME = 'Las Vegas Poker Training';
const LVPT_PORTAL_ORIGIN = 'https://lvpt-poker-proof-studio.vercel.app';

const LVPT_ALLOWED_BLOB_HOSTS = [
  'avd0q6zau931hwsb.public.blob.vercel-storage.com'
];

function doGet() {
  return jsonResponse_({
    success: true,
    service: 'LVPT Client Event Portal Email Receiver'
  });
}

function doPost(e) {
  try {
    const data = parsePayload_(e);
    validatePayload_(data);

    const inlineImages = fetchInlineImages_(data.images || []);
    const imageCount = Object.keys(inlineImages).length;

    const internalSubject =
      (data.client || 'Client') + ' submitted LVPT event selections';

    const clientSubject =
      'Confirmation — ' + (data.client || 'Your') + ' Event Selections';

    const internalHtml = buildEmailHtml_(data, true, inlineImages);
    const clientHtml = buildEmailHtml_(data, false, inlineImages);

    GmailApp.sendEmail(
      LVPT_INTERNAL_EMAIL,
      internalSubject,
      buildPlainText_(data, true),
      {
        htmlBody: internalHtml,
        inlineImages: inlineImages,
        name: LVPT_SENDER_NAME,
        replyTo: data.email
      }
    );

    GmailApp.sendEmail(
      data.email,
      clientSubject,
      buildPlainText_(data, false),
      {
        htmlBody: clientHtml,
        inlineImages: inlineImages,
        name: LVPT_SENDER_NAME,
        replyTo: LVPT_INTERNAL_EMAIL
      }
    );

    return jsonResponse_({
      success: true,
      imagesIncluded: imageCount,
      clientConfirmationSent: true
    });

  } catch (err) {
    console.error(err);
    return jsonResponse_({
      success: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function parsePayload_(e) {
  if (!e) throw new Error('Missing request.');

  const contentType =
    (e.postData && e.postData.type ? e.postData.type : '').toLowerCase();

  if (contentType.indexOf('application/json') !== -1) {
    return JSON.parse(e.postData.contents || '{}');
  }

  // Preferred browser submission format. This mirrors the working
  // EDC Shuttle Apps Script handoff pattern.
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  return e.parameter || {};
}

function validatePayload_(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid submission.');
  }

  if (!data.submittedBy) {
    throw new Error('Submitted name is required.');
  }

  if (!isEmail_(data.email)) {
    throw new Error('A valid client email is required.');
  }

  if (data.portalUrl) {
    const portal = String(data.portalUrl);
    if (
      portal.indexOf(LVPT_PORTAL_ORIGIN) !== 0 &&
      portal.indexOf('blob:' + LVPT_PORTAL_ORIGIN) !== 0
    ) {
      throw new Error('Unrecognized portal origin.');
    }
  }

  if (Array.isArray(data.images) && data.images.length > 5) {
    throw new Error('Too many images.');
  }
}

function fetchInlineImages_(images) {
  const result = {};

  (images || []).slice(0, 5).forEach(function(item, index) {
    if (!item || !item.url) return;

    const url = String(item.url);
    if (!isAllowedBlobUrl_(url)) {
      throw new Error('Unapproved image host.');
    }

    const response = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Could not load selected image.');
    }

    const key = imageKey_(item, index);
    result[key] = response
      .getBlob()
      .setName(item.name || (key + '.jpg'));
  });

  return result;
}

function isAllowedBlobUrl_(url) {
  try {
    const match = /^https:\/\/([^\/]+)\//i.exec(url);
    if (!match) return false;
    return LVPT_ALLOWED_BLOB_HOSTS.indexOf(match[1].toLowerCase()) !== -1;
  } catch (_) {
    return false;
  }
}

function imageKey_(item, index) {
  const n = String(item.name || '').toLowerCase();

  if (n.indexOf('chip') !== -1) return 'chip';
  if (n.indexOf('card-front') !== -1) return 'cardFront';
  if (n.indexOf('card-back') !== -1) return 'cardBack';
  if (n.indexOf('food') !== -1 || n.indexOf('culinary') !== -1) return 'culinary';
  if (n.indexOf('drink') !== -1 || n.indexOf('bar') !== -1) return 'bar';

  return 'image' + (index + 1);
}

function buildEmailHtml_(data, isInternal, inlineImages) {
  const s = data.selections || {};
  const b = data.beverage || {};

  const intro = isInternal
    ? '<strong>' + esc_(data.submittedBy) + '</strong> submitted the following event selections.'
    : 'Thank you, <strong>' + esc_(data.submittedBy) + '</strong>. Your event selections have been received by Las Vegas Poker Training.';

  const visualBlocks = [];

  if (inlineImages.chip) {
    visualBlocks.push(
      visualCard_(
        'CHIP DESIGN',
        s.chip || 'Selected Chip',
        '<img src="cid:chip" style="display:block;max-width:220px;max-height:180px;margin:0 auto;" alt="Selected chip design">'
      )
    );
  }

  if (inlineImages.cardFront || inlineImages.cardBack) {
    let cardImgs = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>';
    if (inlineImages.cardFront) {
      cardImgs += '<td width="50%" align="center" style="padding:4px;"><img src="cid:cardFront" style="display:block;max-width:150px;max-height:190px;margin:0 auto;" alt="Selected card front"></td>';
    }
    if (inlineImages.cardBack) {
      cardImgs += '<td width="50%" align="center" style="padding:4px;"><img src="cid:cardBack" style="display:block;max-width:150px;max-height:190px;margin:0 auto;" alt="Selected card back"></td>';
    }
    cardImgs += '</tr></table>';

    visualBlocks.push(
      visualCard_('CARD DESIGN', s.card || 'Selected Card', cardImgs)
    );
  }

  if (inlineImages.culinary) {
    visualBlocks.push(
      visualCard_(
        'CULINARY EXPERIENCE',
        s.culinary || 'Selected Culinary Experience',
        '<img src="cid:culinary" style="display:block;width:100%;max-width:460px;height:auto;margin:0 auto;" alt="Selected culinary experience">'
      )
    );
  }

  if (inlineImages.bar) {
    visualBlocks.push(
      visualCard_(
        'BAR EXPERIENCE',
        s.bar || 'Selected Bar Experience',
        '<img src="cid:bar" style="display:block;width:100%;max-width:460px;height:auto;margin:0 auto;" alt="Selected bar experience">'
      )
    );
  }

  const beverages = [
    ['Beer', joinNonEmpty_([b.beer1, b.beer2])],
    ['Red Wine', joinNonEmpty_([b.red1, b.red2])],
    ['White Wine', joinNonEmpty_([b.white1, b.white2])],
    ['Premium Liquor Requests', joinNonEmpty_([b.liq1, b.liq2, b.liq3])]
  ];

  const eventFacts = [
    ['Client', data.client || ''],
    ['Event', data.event || ''],
    ['Event Date', data.eventDate || ''],
    ['Event Time', data.eventTime || ''],
    ['Expected Guests', data.guests || '']
  ];

  return ''
    + '<!doctype html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f5f2e9;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 10px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#11110f;border:1px solid #2c261a;border-radius:18px;overflow:hidden;">'

    + '<tr><td style="padding:30px 30px 24px;border-bottom:1px solid #2c261a;background:#0d0d0c;">'
    + '<div style="font-size:11px;letter-spacing:2px;color:#d8b965;font-weight:700;">LAS VEGAS POKER TRAINING</div>'
    + '<div style="font-size:26px;line-height:1.2;font-weight:700;margin-top:8px;">Event Selections Received</div>'
    + '<div style="font-size:14px;line-height:1.6;color:#aaa59a;margin-top:10px;">' + intro + '</div>'
    + '</td></tr>'

    + '<tr><td style="padding:24px 30px 8px;">'
    + factsTable_(eventFacts)
    + '</td></tr>'

    + '<tr><td style="padding:10px 30px 8px;">'
    + '<div style="font-size:11px;letter-spacing:2px;color:#d8b965;font-weight:700;margin-bottom:10px;">YOUR CHOSEN DESIGNS</div>'
    + visualBlocks.join('')
    + '</td></tr>'

    + '<tr><td style="padding:18px 30px 4px;">'
    + '<div style="font-size:11px;letter-spacing:2px;color:#d8b965;font-weight:700;margin-bottom:10px;">BEVERAGE REQUESTS</div>'
    + factsTable_(beverages)
    + '</td></tr>'

    + '<tr><td style="padding:18px 30px 28px;">'
    + '<div style="font-size:11px;letter-spacing:2px;color:#d8b965;font-weight:700;margin-bottom:8px;">COMMENTS / REQUESTS</div>'
    + '<div style="background:#0b0b0a;border:1px solid #29261f;border-radius:10px;padding:14px;font-size:13px;line-height:1.6;color:#d5d1c7;">'
    + nl2br_(data.comments || 'None')
    + '</div>'
    + '</td></tr>'

    + '<tr><td style="padding:18px 30px 28px;border-top:1px solid #2c261a;color:#77736c;font-size:11px;line-height:1.6;">'
    + (isInternal
      ? 'Submitted by ' + esc_(data.submittedBy) + ' &lt;' + esc_(data.email) + '&gt;'
      : 'Las Vegas Poker Training will review your selections and contact you if anything needs clarification.')
    + (data.portalUrl ? '<br>Portal: ' + esc_(data.portalUrl) : '')
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

function visualCard_(label, title, mediaHtml) {
  return ''
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:#0b0b0a;border:1px solid #29261f;border-radius:12px;">'
    + '<tr><td style="padding:10px 14px 4px;color:#77736c;font-size:9px;letter-spacing:1.4px;font-weight:700;">'
    + esc_(label)
    + '</td></tr>'
    + '<tr><td style="padding:0 14px 10px;color:#fff;font-size:15px;font-weight:700;">'
    + esc_(title)
    + '</td></tr>'
    + '<tr><td align="center" style="padding:10px 14px 16px;">'
    + mediaHtml
    + '</td></tr>'
    + '</table>';
}

function factsTable_(rows) {
  let html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">';

  rows.forEach(function(row) {
    if (!row[1]) return;

    html += ''
      + '<tr>'
      + '<td width="34%" style="padding:8px 10px 8px 0;border-bottom:1px solid #24211b;color:#8f8b84;font-size:11px;font-weight:700;">'
      + esc_(row[0])
      + '</td>'
      + '<td style="padding:8px 0;border-bottom:1px solid #24211b;color:#f2efe7;font-size:12px;">'
      + esc_(row[1])
      + '</td>'
      + '</tr>';
  });

  return html + '</table>';
}

function buildPlainText_(data, isInternal) {
  const s = data.selections || {};
  const b = data.beverage || {};

  const lines = [
    'LAS VEGAS POKER TRAINING — EVENT SELECTIONS',
    '',
    isInternal
      ? (data.submittedBy + ' submitted event selections.')
      : ('Thank you, ' + data.submittedBy + '. Your event selections were received.'),
    '',
    'Client: ' + (data.client || ''),
    'Event: ' + (data.event || ''),
    'Event Date: ' + (data.eventDate || ''),
    'Event Time: ' + (data.eventTime || ''),
    'Expected Guests: ' + (data.guests || ''),
    '',
    'Chip Design: ' + (s.chip || 'Not selected'),
    'Card Design: ' + (s.card || 'Not selected'),
    'Culinary Experience: ' + (s.culinary || 'Not selected'),
    'Bar Experience: ' + (s.bar || 'Not selected'),
    '',
    'Beer: ' + joinNonEmpty_([b.beer1, b.beer2]),
    'Red Wine: ' + joinNonEmpty_([b.red1, b.red2]),
    'White Wine: ' + joinNonEmpty_([b.white1, b.white2]),
    'Premium Liquor Requests: ' + joinNonEmpty_([b.liq1, b.liq2, b.liq3]),
    '',
    'Comments / Requests:',
    data.comments || 'None'
  ];

  return lines.join('\n');
}

function joinNonEmpty_(values) {
  const list = (values || []).filter(function(v) {
    return v && String(v).trim();
  }).map(function(v) {
    return String(v).trim();
  });

  return list.length ? list.join(', ') : 'None';
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function esc_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br_(value) {
  return esc_(value).replace(/\r?\n/g, '<br>');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
