const Setting = require('../models/Setting');
const { fail } = require('./helpers');

const TIME_ZONE = 'Asia/Kolkata';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const campuses = new Set(['BIRT', 'BIRTS', 'BIST']);

function settingKey(campus) {
  if (!campuses.has(campus)) throw fail(400, 'A valid college must be selected.');
  return `college-attendance-hours-${campus}`;
}
async function getCollegeAttendanceHours(campus) {
  const setting = await Setting.findOne({ key: settingKey(campus) }).lean();
  const value = setting?.value;
  if (!value || !TIME_PATTERN.test(value.openTime) || !TIME_PATTERN.test(value.closeTime)) {
    return { configured: false, openTime: '', closeTime: '' };
  }
  return { configured: true, openTime: value.openTime, closeTime: value.closeTime };
}

function currentCollegeMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

function timeToMinutes(value) {
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

function attendanceHoursStatus(hours, now = new Date()) {
  if (!hours.configured) {
    return {
      isOpen: false,
      message: 'College attendance timings have not been set. Please contact your college administrator.'
    };
  }
  const nowMinutes = currentCollegeMinutes(now);
  const opening = timeToMinutes(hours.openTime);
  const closing = timeToMinutes(hours.closeTime);
  if (nowMinutes < opening) {
    return {
      isOpen: false,
      message: `College opens at ${formatTime(hours.openTime)} India time. You can mark attendance after it opens.`
    };
  }
  if (nowMinutes >= closing) {
    return {
      isOpen: false,
      message: `College closed at ${formatTime(hours.closeTime)} India time. You can mark attendance after it opens at ${formatTime(hours.openTime)} India time.`
    };
  }
  return { isOpen: true, message: '' };
}

async function assertAttendanceWithinCollegeHours(campus, now = new Date()) {
  const hours = await getCollegeAttendanceHours(campus);
  const status = attendanceHoursStatus(hours, now);
  if (!status.isOpen) throw fail(hours.configured ? 403 : 409, status.message);
  return hours;
}

module.exports = {
  settingKey,
  TIME_PATTERN,
  getCollegeAttendanceHours,
  attendanceHoursStatus,
  assertAttendanceWithinCollegeHours,
  timeToMinutes
};
