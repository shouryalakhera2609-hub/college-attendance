const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceHoursStatus, timeToMinutes } = require('../utils/collegeAttendanceHours');

const hours = { configured: true, openTime: '09:00', closeTime: '17:00' };

test('college attendance hours use India local time and include the opening minute', () => {
  assert.equal(attendanceHoursStatus(hours, new Date('2026-11-09T03:29:00Z')).isOpen, false);
  assert.equal(attendanceHoursStatus(hours, new Date('2026-11-09T03:30:00Z')).isOpen, true);
});

test('college attendance is blocked at closing time and tells staff when it opens again', () => {
  assert.equal(attendanceHoursStatus(hours, new Date('2026-11-09T11:29:00Z')).isOpen, true);
  const status = attendanceHoursStatus(hours, new Date('2026-11-09T11:30:00Z'));
  assert.equal(status.isOpen, false);
  assert.match(status.message, /closed at 5:00 PM India time/);
  assert.match(status.message, /opens at 9:00 AM India time/);
});

test('attendance stays blocked with an administrator message until college hours are configured', () => {
  const status = attendanceHoursStatus({ configured: false }, new Date('2026-11-09T06:00:00Z'));
  assert.equal(status.isOpen, false);
  assert.match(status.message, /Please contact your college administrator/);
});

test('college time parsing rejects invalid values', () => {
  assert.equal(timeToMinutes('09:00'), 540);
  assert.equal(timeToMinutes('17:00'), 1020);
  assert.equal(timeToMinutes('25:00'), null);
});
