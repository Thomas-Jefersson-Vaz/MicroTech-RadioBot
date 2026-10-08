export function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}
export function integer(value, min, max, label = 'Value') {
    if (typeof value !== 'string' && typeof value !== 'number') fail(label + ' must be an integer');
    if (typeof value === 'string' && !/^\d+$/.test(value)) fail(label + ' must be an integer');
    const number = Number(value);
    if (value === null || value === undefined || value === '' || !Number.isInteger(number) || number < min || number > max)
        fail(label + ' must be between ' + min + ' and ' + max);
    return number;
}
export function text(value, max = 1000, label = 'Text') {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + ' is required (max ' + max + ' characters)');
    return value.trim();
}
export function webUrl(value) {
    const input = text(value, 2048, 'URL');
    let url;
    try { url = new URL(input); }
    catch { fail('Use a valid HTTP or HTTPS URL'); }
    if (!['http:', 'https:'].includes(url.protocol)) fail('Use an HTTP or HTTPS URL');
    return url.toString();
}
