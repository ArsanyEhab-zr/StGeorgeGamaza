const clone = value => value == null ? value : structuredClone(value);
class Table {
    rows = new Map();
    next = 1;
    async toArray() { return [...this.rows.values()].map(clone); }
    async get(id) { return clone(this.rows.get(id)); }
    async put(row) { const id = row.id ?? this.next++; this.rows.set(id, clone({ ...row, id })); return id; }
    async add(row) { return this.put(row); }
    async update(id, changes) { if (this.rows.has(id)) this.rows.set(id, { ...this.rows.get(id), ...clone(changes) }); }
    async delete(id) { this.rows.delete(id); }
    async clear() { this.rows.clear(); this.next = 1; }
    where(field) { return { equals: value => ({ toArray: async () => (await this.toArray()).filter(r => r[field] === value) }) }; }
}
export const db = { children: new Table(), attendance: new Table(), grades: new Table(), transaction: async (...args) => args.at(-1)() };
export const firestore = {};
export const remote = new Map();
export const encryptData = clone;
export const decryptData = clone;
export const collection = (_, ...parts) => ({ path: parts.join('/') });
export const doc = (_, ...parts) => ({ path: parts.join('/'), id: parts.at(-1) });
const snapshot = path => ({ id: path.split('/').at(-1), ref: { parent: { id: path.split('/')[2], parent: { id: path.split('/')[1] } } }, exists: () => remote.has(path), data: () => clone(remote.get(path)) });
export const network = { read: null, write: null };
export const getDocsFromServer = async ref => {
    await network.read?.(ref);
    return { docs: [...remote.keys()].filter(k => k.startsWith(ref.path + '/') && k.split('/').length === 4).map(snapshot) };
};
export const getDocs = getDocsFromServer;
export const getDoc = async ref => { await network.read?.(ref); return snapshot(ref.path); };
export const setDoc = async (ref, data, options) => {
    await network.write?.(ref, data);
    remote.set(ref.path, { ...(options?.merge ? remote.get(ref.path) : {}), ...clone(data) });
};
export const deleteDoc = async ref => { await network.write?.(ref); remote.delete(ref.path); };
export const collectionGroup = (_, name) => ({ path: name });

export const logActivity = async () => {};
