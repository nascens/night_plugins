const NightPlugin = loader.SDK.NightPlugin;
const utils = loader.SDK.utils;
const manifest = {
    name: "Manyvids Test",
    description: "An example plugin for NightLoader",
    author: "nascens",
    version: "1.0.0",
    sdk_version: "0.1.0",
    module: "manyvids"
}

function on_load() {
    alert(`Manyvids Test loaded!`);
}

async function load() {
    console.log(`Manyvids Test is loading...`);
}

export {
    load,
    manifest
}
