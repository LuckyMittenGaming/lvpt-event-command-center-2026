/**
 * LVPT event date/time helpers — pure, no network.
 * Sheets time-only serials often export as 1899-12-30/31 ISO; wall clock is
 * recovered via a fixed UTC-5 offset (not historical LMT).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTEventDateTime = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const SHEETS_EPOCH_RE =
    /^1899-12-3[01]T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;
  const PLAIN_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  const ZONE_ABBREV = {
    'America/Los_Angeles': 'PT',
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Phoenix': 'MST'
  };

  const ABBREV_TO_IANA = {
    PT: 'America/Los_Angeles',
    PST: 'America/Los_Angeles',
    PDT: 'America/Los_Angeles',
    ET: 'America/New_York',
    EST: 'America/New_York',
    EDT: 'America/New_York',
    CT: 'America/Chicago',
    CST: 'America/Chicago',
    CDT: 'America/Chicago',
    MT: 'America/Denver',
    MST: 'America/Phoenix',
    MDT: 'America/Denver'
  };

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function pickFields(eventOrFields) {
    if (!eventOrFields || typeof eventOrFields !== 'object') return {};
    const setup =
      eventOrFields.setup && typeof eventOrFields.setup === 'object'
        ? eventOrFields.setup
        : {};
    return {
      timezone: eventOrFields.timezone || eventOrFields.timeZone || setup.timeZone || '',
      city: eventOrFields.city || setup.city || '',
      state: eventOrFields.state || setup.state || '',
      venue: eventOrFields.venue || setup.venue || ''
    };
  }

  function normalizeIana(raw) {
    const value = text(raw);
    if (!value) return '';
    if (/^[A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(value)) return value;
    const upper = value.toUpperCase();
    if (ABBREV_TO_IANA[upper]) return ABBREV_TO_IANA[upper];
    return '';
  }

  function inferFromLocation(city, state, venue) {
    const blob = `${city} ${state} ${venue}`.toLowerCase();
    if (/\bphoenix\b|\baz\b|\barizona\b/.test(blob)) return 'America/Phoenix';
    if (/\bdenver\b|\bcolorado\b|\bco\b|\bsalt lake|\butah\b|\but\b/.test(blob)) {
      return 'America/Denver';
    }
    if (
      /\bchicago\b|\bdallas\b|\bhouston\b|\bauistin\b|\btexas\b|\btx\b|\bil\b|\billinois\b|\bwisconsin\b|\bwi\b|\bminnesota\b|\bmn\b/.test(
        blob
      )
    ) {
      return 'America/Chicago';
    }
    if (
      /\bnew york\b|\bny\b|\bboston\b|\bmassachusetts\b|\bma\b|\bmiami\b|\bflorida\b|\bfl\b|\bconnecticut\b|\batlanta\b|\bgeorgia\b|\bga\b/.test(
        blob
      )
    ) {
      return 'America/New_York';
    }
    if (
      /\blas vegas\b|\bnevada\b|\bnv\b|\bcalifornia\b|\bca\b|\blos angeles\b|\bsan francisco\b|\bsan diego\b|\bpacific\b/.test(
        blob
      )
    ) {
      return 'America/Los_Angeles';
    }
    return '';
  }

  function resolveEventTimeZone(eventOrFields) {
    if (typeof eventOrFields === 'string') {
      const fromString = normalizeIana(eventOrFields);
      return fromString || 'America/Los_Angeles';
    }
    const fields = pickFields(eventOrFields);
    const fromExplicit = normalizeIana(fields.timezone);
    if (fromExplicit) return fromExplicit;
    const fromLocation = inferFromLocation(fields.city, fields.state, fields.venue);
    if (fromLocation) return fromLocation;
    return 'America/Los_Angeles';
  }

  function zoneAbbreviation(timeZone) {
    const iana = resolveEventTimeZone(timeZone);
    return ZONE_ABBREV[iana] || 'PT';
  }

  /**
   * Sheets time-only values exported as 1899-12-30/31 ISO.
   * Wall clock via fixed UTC-5: localHour = (utcHours - 5 + 24) % 24.
   */
  function decodeSheetsWallClock(value) {
    if (value == null || value === '') {
      return { hour: 0, minute: 0, second: 0, valid: false };
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      // Fractional day (Sheets serial time portion).
      const totalSeconds = Math.round((value % 1) * 24 * 60 * 60);
      const hour = Math.floor(totalSeconds / 3600) % 24;
      const minute = Math.floor((totalSeconds % 3600) / 60);
      const second = totalSeconds % 60;
      return { hour, minute, second, valid: true };
    }

    const raw = text(value);
    const plain = PLAIN_TIME_RE.exec(raw);
    if (plain) {
      const hour = Number(plain[1]);
      const minute = Number(plain[2]);
      const second = Number(plain[3] || 0);
      if (hour > 23 || minute > 59 || second > 59) {
        return { hour: 0, minute: 0, second: 0, valid: false };
      }
      return { hour, minute, second, valid: true };
    }

    const sheets = SHEETS_EPOCH_RE.exec(raw);
    if (sheets) {
      const utcHours = Number(sheets[1]);
      const utcMinutes = Number(sheets[2]);
      const utcSeconds = Number(sheets[3]);
      // Fixed UTC-5 (not historical LMT): subtract 5 hours from UTC components.
      const hour = (utcHours - 5 + 24) % 24;
      return { hour, minute: utcMinutes, second: utcSeconds, valid: true };
    }

    // Also accept Date objects that land on the Sheets epoch day.
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const iso = value.toISOString();
      if (/^1899-12-3[01]T/.test(iso)) {
        return decodeSheetsWallClock(iso);
      }
    }

    return { hour: 0, minute: 0, second: 0, valid: false };
  }

  function formatWallClock(hour, minute, timeZone) {
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return '';
    }
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const mm = String(Math.floor(m)).padStart(2, '0');
    const abbr = zoneAbbreviation(timeZone);
    return `${hour12}:${mm} ${period} ${abbr}`;
  }

  function resolveTzArg(eventOrTz) {
    if (typeof eventOrTz === 'string') return resolveEventTimeZone(eventOrTz);
    return resolveEventTimeZone(eventOrTz || {});
  }

  function formatEventTime(value, eventOrTz) {
    const decoded = decodeSheetsWallClock(value);
    if (!decoded.valid) return '';
    return formatWallClock(decoded.hour, decoded.minute, resolveTzArg(eventOrTz));
  }

  function parseInstant(isoOrDate) {
    if (isoOrDate instanceof Date) {
      return Number.isNaN(isoOrDate.getTime()) ? null : isoOrDate;
    }
    const raw = text(isoOrDate);
    if (!raw) return null;
    const dateOnly = DATE_ONLY_RE.exec(raw);
    if (dateOnly) {
      // Noon UTC avoids most previous-day shifts when formatting in US zones.
      return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00.000Z`);
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function zonedParts(date, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: resolveEventTimeZone(timeZone),
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const parts = fmt.formatToParts(date);
    const get = (type) => {
      const found = parts.find((p) => p.type === type);
      return found ? found.value : '';
    };
    return {
      month: get('month'),
      day: get('day'),
      year: get('year'),
      hour: get('hour'),
      minute: get('minute'),
      dayPeriod: get('dayPeriod')
    };
  }

  function formatEventDate(value, eventOrTz) {
    const date = parseInstant(value);
    if (!date) return '';
    const tz = resolveTzArg(eventOrTz);
    const parts = zonedParts(date, tz);
    return `${parts.month} ${parts.day}, ${parts.year}`;
  }

  function formatEventDateTime(isoOrDate, eventOrTz) {
    const raw = text(isoOrDate);
    const tz = resolveTzArg(eventOrTz);
    if (typeof isoOrDate === 'string' && DATE_ONLY_RE.test(raw)) {
      return formatEventDate(raw, tz);
    }

    const date = parseInstant(isoOrDate);
    if (!date) return '';

    const parts = zonedParts(date, tz);
    const abbr = zoneAbbreviation(tz);
    const dateLabel = `${parts.month} ${parts.day}, ${parts.year}`;
    if (!parts.hour) return dateLabel;
    return `${dateLabel} · ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${abbr}`;
  }

  return {
    resolveEventTimeZone,
    decodeSheetsWallClock,
    formatWallClock,
    formatEventTime,
    formatEventDateTime,
    formatEventDate,
    zoneAbbreviation
  };
});
