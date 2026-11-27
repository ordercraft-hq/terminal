import type { BusinessDay, Time } from 'lightweight-charts';

export interface TimezoneItem {
  label: string;
  value: string;
  offsetSec: number;
}

export const ALL_TIMEZONES: TimezoneItem[] = [
  { label: 'UTC-12:00 (Baker Island, Howland Island)', value: 'UTC-12', offsetSec: -12 * 3600 },
  { label: 'UTC-11:00 (Pago Pago, Samoa, Midway)', value: 'UTC-11', offsetSec: -11 * 3600 },
  { label: 'UTC-10:00 (Honolulu, Hawaii / HST)', value: 'UTC-10', offsetSec: -10 * 3600 },
  { label: 'UTC-9:30 (Marquesas Islands)', value: 'UTC-9:30', offsetSec: -9.5 * 3600 },
  { label: 'UTC-9:00 (Anchorage, Alaska / AKST)', value: 'UTC-9', offsetSec: -9 * 3600 },
  { label: 'UTC-8:00 (Los Angeles, San Francisco, Vancouver / PST)', value: 'UTC-8', offsetSec: -8 * 3600 },
  { label: 'UTC-7:00 (Denver, Phoenix, Calgary / MST)', value: 'UTC-7', offsetSec: -7 * 3600 },
  { label: 'UTC-6:00 (Chicago, Mexico City, Dallas, Houston / CST)', value: 'UTC-6', offsetSec: -6 * 3600 },
  { label: 'UTC-5:00 (New York, Toronto, Miami, Bogota / EST)', value: 'UTC-5', offsetSec: -5 * 3600 },
  { label: 'UTC-4:00 (New York, Toronto, Miami / EDT, Santiago, Caracas, Bermuda / AST)', value: 'UTC-4', offsetSec: -4 * 3600 },
  { label: 'UTC-3:30 (St. John\'s, Newfoundland / NST)', value: 'UTC-3:30', offsetSec: -3.5 * 3600 },
  { label: 'UTC-3:00 (São Paulo, Buenos Aires, Montevideo)', value: 'UTC-3', offsetSec: -3 * 3600 },
  { label: 'UTC-2:00 (Fernando de Noronha, South Georgia)', value: 'UTC-2', offsetSec: -2 * 3600 },
  { label: 'UTC-1:00 (Cape Verde, Azores)', value: 'UTC-1', offsetSec: -1 * 3600 },
  { label: 'UTC+0:00 (London, Dublin, Lisbon, Reykjavik / GMT)', value: 'UTC', offsetSec: 0 },
  { label: 'UTC+1:00 (Berlin, Paris, Madrid, Rome, Zurich, Frankfurt, Amsterdam, Lagos / CET)', value: 'UTC+1', offsetSec: 1 * 3600 },
  { label: 'UTC+2:00 (Athens, Cairo, Johannesburg, Helsinki, Jerusalem, Kyiv / EET)', value: 'UTC+2', offsetSec: 2 * 3600 },
  { label: 'UTC+3:00 (Moscow, Istanbul, Riyadh, Doha, Nairobi, Kuwait / MSK)', value: 'UTC+3', offsetSec: 3 * 3600 },
  { label: 'UTC+3:30 (Tehran / IRST)', value: 'UTC+3:30', offsetSec: 3.5 * 3600 },
  { label: 'UTC+4:00 (Dubai, Abu Dhabi, Baku, Muscat, Tbilisi / GST)', value: 'UTC+4', offsetSec: 4 * 3600 },
  { label: 'UTC+4:30 (Kabul / AFT)', value: 'UTC+4:30', offsetSec: 4.5 * 3600 },
  { label: 'UTC+5:00 (Karachi, Tashkent, Islamabad / PKT)', value: 'UTC+5', offsetSec: 5 * 3600 },
  { label: 'UTC+5:30 (Kolkata, Mumbai, New Delhi, Colombo / IST)', value: 'UTC+5:30', offsetSec: 5.5 * 3600 },
  { label: 'UTC+5:45 (Kathmandu / NPT)', value: 'UTC+5:45', offsetSec: 5.75 * 3600 },
  { label: 'UTC+6:00 (Dhaka, Almaty, Astana / BST)', value: 'UTC+6', offsetSec: 6 * 3600 },
  { label: 'UTC+6:30 (Yangon, Cocos Islands / MMT)', value: 'UTC+6:30', offsetSec: 6.5 * 3600 },
  { label: 'UTC+7:00 (Bangkok, Jakarta, Ho Chi Minh, Hanoi / ICT)', value: 'UTC+7', offsetSec: 7 * 3600 },
  { label: 'UTC+8:00 (Singapore, Hong Kong, Shanghai, Beijing, Taipei, Perth / SGT, HKT)', value: 'UTC+8', offsetSec: 8 * 3600 },
  { label: 'UTC+8:45 (Eucla / ACWST)', value: 'UTC+8:45', offsetSec: 8.75 * 3600 },
  { label: 'UTC+9:00 (Tokyo, Seoul, Osaka / JST, KST)', value: 'UTC+9', offsetSec: 9 * 3600 },
  { label: 'UTC+9:30 (Adelaide, Darwin / ACST)', value: 'UTC+9:30', offsetSec: 9.5 * 3600 },
  { label: 'UTC+10:00 (Sydney, Melbourne, Brisbane, Vladivostok, Guam / AEST)', value: 'UTC+10', offsetSec: 10 * 3600 },
  { label: 'UTC+10:30 (Lord Howe Island / LHST)', value: 'UTC+10:30', offsetSec: 10.5 * 3600 },
  { label: 'UTC+11:00 (Solomon Islands, New Caledonia, Magadan)', value: 'UTC+11', offsetSec: 11 * 3600 },
  { label: 'UTC+11:30 (Norfolk Island / NFT)', value: 'UTC+11:30', offsetSec: 11.5 * 3600 },
  { label: 'UTC+12:00 (Auckland, Wellington, Fiji, Marshall Islands / NZST)', value: 'UTC+12', offsetSec: 12 * 3600 },
  { label: 'UTC+12:45 (Chatham Islands / CHAST)', value: 'UTC+12:45', offsetSec: 12.75 * 3600 },
  { label: 'UTC+13:00 (Nuku\'alofa, Samoa, Phoenix Islands / TOT)', value: 'UTC+13', offsetSec: 13 * 3600 },
  { label: 'UTC+14:00 (Kiritimati, Line Islands / LINT)', value: 'UTC+14', offsetSec: 14 * 3600 },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function isBusinessDay(time: Time): time is BusinessDay {
  return typeof time === 'object' && time !== null && 'year' in time && 'month' in time && 'day' in time;
}

function toUnixSeconds(time: Time): number | null {
  if (typeof time === 'number') {
    return time;
  }
  if (isBusinessDay(time)) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }
  return null;
}

export function getTimezoneOffsetSeconds(tz: string): number {
  if (!tz || tz === 'UTC' || tz === 'UTC+0' || tz === 'UTC+0:00' || tz === 'GMT') return 0;

  const found = ALL_TIMEZONES.find((item) => item.value === tz);
  if (found) return found.offsetSec;

  // Regex parse: UTC+5:30, UTC-8, UTC+05:00
  const match = tz.match(/UTC([+-])(\d+)(?::(\d+))?/i);
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    return sign * (hours * 3600 + minutes * 60);
  }

  // Fallback for decimal UTC+5.5
  const decMatch = tz.match(/UTC([+-]\d+(?:\.\d+)?)/i);
  if (decMatch) {
    return Math.round(parseFloat(decMatch[1]) * 3600);
  }

  return 0;
}

/**
 * Format X-axis tick marks in the chosen timezone.
 */
export function formatTickMarkInTimezone(
  time: Time,
  tickMarkType: number,
  timezone: string,
  showSeconds = false
): string | null {
  const ts = toUnixSeconds(time);
  if (ts === null) return null;

  const offset = getTimezoneOffsetSeconds(timezone);
  const d = new Date((ts + offset) * 1000);

  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  switch (tickMarkType) {
    case 0: // Year
      return String(year);
    case 1: // Month
      return month;
    case 2: // DayOfMonth
      return `${day} ${month}`;
    case 3: // Time
      if (showSeconds && d.getUTCSeconds() !== 0) {
        return `${hours}:${minutes}:${seconds}`;
      }
      return `${hours}:${minutes}`;
    case 4: // TimeWithSeconds
      return `${hours}:${minutes}:${seconds}`;
    default:
      if (showSeconds) {
        return `${hours}:${minutes}:${seconds}`;
      }
      return `${hours}:${minutes}`;
  }
}

/**
 * Format crosshair date/time pill in the chosen timezone.
 */
export function formatCrosshairTimeInTimezone(
  time: Time,
  timezone: string,
  showSeconds = false
): string {
  const ts = toUnixSeconds(time);
  if (ts === null) return '';

  const offset = getTimezoneOffsetSeconds(timezone);
  const d = new Date((ts + offset) * 1000);

  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);

  if (showSeconds || d.getUTCSeconds() !== 0) {
    return `${day} ${month} '${year}  ${hours}:${minutes}:${seconds}`;
  }
  return `${day} ${month} '${year}  ${hours}:${minutes}`;
}
