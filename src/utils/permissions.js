export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    STAGE_ADMIN: 'stage_admin',
    DATA_ENTRY: 'data_entry'
};

export const checkPermission = (user, action, targetStageId = null) => {
    if (!user || !user.role) return false;
    
    if (user.role === ROLES.SUPER_ADMIN) return true;

    switch (action) {
        case 'view_data':
        case 'edit_data':
            if (user.role === ROLES.STAGE_ADMIN || user.role === ROLES.DATA_ENTRY) {
                return user.assignedStages?.includes(targetStageId) || user.assignedStages?.includes('all');
            }
            break;
            
        case 'manage_system':
            return false;
            
        case 'delete_record':
            if (user.role === ROLES.STAGE_ADMIN) {
                return user.assignedStages?.includes(targetStageId) || user.assignedStages?.includes('all');
            }
            return false; 
            
        default:
            return false;
    }
    
    return false;
};
