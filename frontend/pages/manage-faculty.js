import { api } from '../js/api.js';
import { crudPage } from '../js/components.js';
export const render = async root => {
  const departments = await api('/admin/registration-departments');
  return crudPage(root, { title: 'Faculty & Staff', path: 'users', del: 'Deactivate', filter: u => u.role !== 'student', lookups: { department: departments }, columns: [{ h: 'Name', v: r => r.name }, { h: 'Email', v: r => r.email }, { h: 'Role', v: r => r.role }, { h: 'Department', v: r => r.department?.name }, { h: 'Status', v: r => r.active ? 'Active' : 'Inactive' }], fields: [{ k: 'name', label: 'Name', req: 1 }, { k: 'email', label: 'Email', type: 'email', req: 1 }, { k: 'instId', label: 'Employee ID' }, { k: 'role', label: 'Role', opts: ['faculty', 'hod', 'admin'] }, { k: 'department', label: 'Department', from: 'departments' }, { k: 'password', label: 'Password (exactly 6 characters)', type: 'password', minLength: 6, maxLength: 6 }] });
};
