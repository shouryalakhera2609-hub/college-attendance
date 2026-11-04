const normalizeCode = code => String(code || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

exports.mergeFacultySubjectHistory = (summary, histories, uploadedSubjects, studentId) => {
  const uploadedByCode = new Map(uploadedSubjects.map(subject => [normalizeCode(subject.code), subject]));
  const classCountsByCode = new Map();
  for (const subject of summary.subjects) {
    classCountsByCode.set(normalizeCode(subject.code), subject.present + subject.absent + subject.excused);
  }
  const totalsByCode = new Map();
  const recent = [];

  for (const history of histories) {
    const key = normalizeCode(history.code);
    const subject = uploadedByCode.get(key);
    if (!subject) continue;

    classCountsByCode.set(key, (classCountsByCode.get(key) || 0) + 1);
    const present = (history.students || []).some(student => String(student.id) === String(studentId));
    const totals = totalsByCode.get(key) || { present: 0, absent: 0 };
    totals[present ? 'present' : 'absent'] += 1;
    totalsByCode.set(key, totals);
    recent.push({
      date: new Date(`${history.date}T00:00:00Z`),
      status: present ? 'present' : 'absent',
      lectureNo: history.lectureNo,
      subject: { code: subject.code, name: subject.name || '-' },
      session: null
    });
  }

  for (const subject of uploadedSubjects) {
    subject.totalClasses = classCountsByCode.get(normalizeCode(subject.code)) || 0;
  }

  const subjectsByCode = new Map(summary.subjects.map(subject => [normalizeCode(subject.code), subject]));
  for (const [key, totals] of totalsByCode) {
    let subject = subjectsByCode.get(key);
    if (!subject) {
      const uploaded = uploadedByCode.get(key);
      subject = {
        id: uploaded.code,
        code: uploaded.code,
        name: uploaded.name || '-',
        present: 0,
        absent: 0,
        excused: 0
      };
      summary.subjects.push(subject);
      subjectsByCode.set(key, subject);
    }

    subject.present += totals.present;
    subject.absent += totals.absent;
    subject.total = subject.present + subject.absent;
    subject.percentage = subject.total
      ? Math.round(subject.present / subject.total * 1000) / 10
      : null;
    subject.low = subject.percentage !== null && subject.percentage < summary.threshold;
    summary.overall.present += totals.present;
    summary.overall.absent += totals.absent;
  }

  for (const subject of uploadedSubjects) {
    const attendance = subjectsByCode.get(normalizeCode(subject.code));
    subject.presentClasses = attendance?.present || 0;
  }

  summary.overall.total = summary.overall.present + summary.overall.absent;
  summary.overall.percentage = summary.overall.total
    ? Math.round(summary.overall.present / summary.overall.total * 1000) / 10
    : null;
  if (summary.recent) {
    summary.recent = [...summary.recent, ...recent]
      .sort((a, b) => new Date(b.date) - new Date(a.date)
        || (b.session?.period || b.lectureNo || 0) - (a.session?.period || a.lectureNo || 0))
      .slice(0, 6);
  }
};
