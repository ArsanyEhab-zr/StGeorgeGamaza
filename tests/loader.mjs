const mocks = new URL('./sync-mocks.mjs', import.meta.url).href;
export async function resolve(specifier, context, next) {
    if (specifier === 'firebase/firestore' || /(?:\/database|\/firebase|\/encryption|\/activityLogger)$/.test(specifier)) return { url: mocks, shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.js', context);
    return next(specifier, context);
}
