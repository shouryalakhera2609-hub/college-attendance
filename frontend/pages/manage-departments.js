import { crudPage } from '../js/components.js';
export const render = root => crudPage(root, { title: 'Departments', path: 'departments', columns: [{ h: 'Code', v: r => r.code }, { h: 'Name', v: r => r.name }], fields: [{ k: 'name', label: 'Name', req: 1 }, { k: 'code', label: 'Code', req: 1 }] });
