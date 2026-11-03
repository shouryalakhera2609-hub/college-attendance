import { crudPage } from '../js/components.js';
export const render = root => crudPage(root, { title: 'Semesters', path: 'semesters', columns: [{ h: 'No.', v: r => r.number }, { h: 'Name', v: r => r.name }], fields: [{ k: 'name', label: 'Name', req: 1 }, { k: 'number', label: 'Number (1-12)', type: 'number', req: 1 }] });
