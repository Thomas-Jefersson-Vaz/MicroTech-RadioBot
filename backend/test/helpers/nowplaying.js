export function components(payload) {
    const all = [];
    const walk = component => {
        const data = component.toJSON ? component.toJSON() : component;
        all.push(data);
        for (const child of data.components || []) walk(child);
        if (data.accessory) walk(data.accessory);
    };
    for (const component of payload.components) walk(component);
    return all;
}
export const panelText = payload => components(payload).filter(item => item.type === 10).map(item => item.content).join('\n');
export const panelButtons = payload => components(payload).filter(item => item.type === 2);
