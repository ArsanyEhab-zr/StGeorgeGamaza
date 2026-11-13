import { useChurchDataEngine } from './useChurchDataEngine';

export function useWeeklyClassActivity() {
    const { activityByClass, classCounts, isLoadingInitialData, weekRange } = useChurchDataEngine();
    return { activityByClass, classCounts, isLoadingInitialData, weekRange };
}
