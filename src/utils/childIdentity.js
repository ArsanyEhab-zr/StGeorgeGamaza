import { normalizeArabicText } from './serviceWeek';

export const timestamp = value => typeof value === 'number' ? value : (value?.toMillis?.() || Date.parse(value) || 0);
export const normalizeArabicName = normalizeArabicText;
export const childAliases = child => [...new Set([child.id, child.cloudId, child.qrId, ...(child.aliasIds || [])].filter(v => v != null && v !== '').map(String))];
export const childNameKey = child => `${child.syncKey}::${normalizeArabicName(child.name || '')}`;
export const sameChild = (a, b) => String(a.syncKey) === String(b.syncKey) && (
    childAliases(a).some(id => childAliases(b).includes(id)) ||
    (!!a.name && !!b.name && childNameKey(a) === childNameKey(b))
);
export const deletionWins = (deleted, active) => deleted?.isDeleted === true && timestamp(active?.restoredAt) <= timestamp(deleted.deletedAt);
export const attendanceIdentity = child => ({
    childId: String(child.cloudId || child.id), childCloudId: String(child.cloudId || child.id),
    childLocalId: String(child.id), childName: child.name, syncKey: child.syncKey
});
export const resolveAttendanceChild = (row, canonical) => {
    const map = canonical.childMapById;
    for (const id of [row.childId, row.childCloudId, row.childLocalId]) {
        if (id == null) continue;
        const child = map.get(`${row.syncKey}::id::${id}`) || map.get(String(id));
        if (child && (!row.syncKey || child.syncKey === row.syncKey)) return child;
    }
    return row.childName ? map.get(childNameKey({ syncKey: row.syncKey, name: row.childName })) : undefined;
};

// Connected components retain every legacy identifier, including transitive duplicate links.
export const groupChildren = children => {
    const groups = [];
    for (const child of children) {
        const matches = groups.filter(g => g.some(c => sameChild(c, child)));
        const merged = [child, ...matches.flat()];
        for (const group of matches) groups.splice(groups.indexOf(group), 1);
        groups.push(merged);
    }
    return groups;
};
export const preferredChild = group => {
    const newest = [...group].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))[0];
    const restored = [...group].sort((a, b) => timestamp(b.restoredAt) - timestamp(a.restoredAt))[0];
    const deleted = [...group].filter(c => c.isDeleted).sort((a, b) => timestamp(b.deletedAt) - timestamp(a.deletedAt))[0];
    const winner = deleted && deletionWins(deleted, restored) ? deleted : (timestamp(restored.restoredAt) > timestamp(newest.updatedAt) ? restored : newest);
    return { ...winner, cloudId: group.flatMap(c => [c.cloudId, ...(c.cloudIds || [])]).filter(Boolean).map(String).sort()[0], aliasIds: [...new Set(group.flatMap(childAliases))] };
};
