module.exports = sections => {
  const departmentsByName = new Map();
  for (const section of sections) {
    const department = section?.department;
    const name = typeof department?.name === 'string' ? department.name.trim() : '';
    const key = name.toLowerCase();
    if (name && !departmentsByName.has(key)) {
      departmentsByName.set(key, { _id: department._id, name, code: department.code });
    }
  }
  return [...departmentsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
};
