import { useChurchDataEngine } from './useChurchDataEngine';

export function useWeeklyClassActivity() {
    const { activityByClass, weekRange } = useChurchDataEngine();
    return { activityByClass, weekRange };
}
