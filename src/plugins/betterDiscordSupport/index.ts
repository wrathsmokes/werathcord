/*
 * werathcord, a Discord client mod
 * BetterDiscord plugin compatibility shim
 */

import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";
import * as Webpack from "@webpack";
import * as WebpackCommon from "@webpack/common";

const Native = VencordNative.pluginHelpers.betterDiscordSupport as PluginNative<typeof import("./native")>;
const logger = new Logger("BetterDiscordSupport");

const injectedStyles = new Map<string, HTMLStyleElement>();

let dataCache: Record<string, Record<string, any>> = {};

export const BdApi = {
    React: WebpackCommon.React,
    ReactDOM: (WebpackCommon as any).ReactDOM,
    version: "1.0.0-shim",
    Webpack: {
        Filters: {
            byProps: (...props: string[]) => (m: any) => m && props.every(p => p in m),
            byStrings: (...strings: string[]) => (m: any) => {
                try { return m && strings.every(s => JSON.stringify(m).includes(s)); } catch { return false; }
            },
            byStoreName: (name: string) => (m: any) => m && m._dispatchToken && m.getName?.() === name,
            byDisplayName: (name: string) => (m: any) => m && (m.displayName === name || m.name === name)
        },
        getModule: (filter: any, ..._args: any[]) => {
            try { return Webpack.find(filter as any); } catch { return undefined; }
        },
        getModules: (filter: any) => {
            try { return Webpack.findAll(filter as any); } catch { return []; }
        },
        getBulk: (...filters: any[]) => filters.map(f => BdApi.Webpack.getModule(f)),
        getStore: (name: string) => {
            try { return Webpack.find(m => m && m.getName && m.getName() === name); } catch { return undefined; }
        }
    },
    Data: {
        load(pluginName: string, key: string) {
            return dataCache[pluginName]?.[key];
        },
        save(pluginName: string, key: string, value: any) {
            dataCache[pluginName] = dataCache[pluginName] ?? {};
            dataCache[pluginName][key] = value;
            try { Native.saveData(pluginName, dataCache[pluginName]); } catch {}
        },
        delete(pluginName: string, key: string) {
            if (dataCache[pluginName]) delete dataCache[pluginName][key];
            try { Native.saveData(pluginName, dataCache[pluginName] ?? {}); } catch {}
        }
    },
    Patcher: {
        _patches: new Map<string, Array<() => void>>(),
        patch(id: string, obj: any, methodName: string, fn: any) {
            try {
                const original = obj[methodName];
                obj[methodName] = function (...args: any[]) {
                    return fn({ original, args }) ?? original.apply(this, args);
                };
                const list = BdApi.Patcher._patches.get(id) ?? [];
                list.push(() => { obj[methodName] = original; });
                BdApi.Patcher._patches.set(id, list);
            } catch (e) { logger.error("Patcher.patch failed", e); }
        },
        unpatchAll(id: string) {
            const list = BdApi.Patcher._patches.get(id);
            if (list) for (const undo of list) undo();
            BdApi.Patcher._patches.delete(id);
        }
    },
    DOM: {
        addStyle(id: string, css: string) { BdApi.DOM.injectCSS(id, css); },
        injectCSS(id: string, css: string) {
            let el = injectedStyles.get(id);
            if (!el) {
                el = document.createElement("style");
                injectedStyles.set(id, el);
                document.head.appendChild(el);
            }
            el.textContent = css;
        },
        clearCSS(id: string) {
            const el = injectedStyles.get(id);
            if (el) { el.remove(); injectedStyles.delete(id); }
        }
    },
    Dom: { injectCSS: (id: string, css: string) => BdApi.DOM.injectCSS(id, css) },
    UI: {
        showToast(message: string, _type?: string) {
            try { WebpackCommon.showToast(message, WebpackCommon.Toasts.Type.MESSAGE); } catch {}
        },
        alert(title: string, content: any) {
            try {
                WebpackCommon.openModal((props: any) =>
                    WebpackCommon.React.createElement("div", props as any,
                        WebpackCommon.React.createElement("h3", null, title),
                        WebpackCommon.React.createElement("div", null, typeof content === "string" ? content : "")
                    )
                );
            } catch {}
        }
    },
    Utils: {
        findByProps: BdApi.Webpack.getModule,
        monkeyPatch: () => {}
    }
};

interface BdPluginInstance {
    start?: () => void;
    stop?: () => void;
    getName?: () => string;
    getVersion?: () => string;
}

const running = new Map<string, BdPluginInstance>();

async function loadBdPlugin(fileName: string) {
    try {
        const code = await Native.readPluginFile(fileName);
        if (!code) return;
        const module = { exports: {} as any };
        const req = (id: string) => {
            if (id === "react") return WebpackCommon.React;
            throw new Error(`Unsupported require("${id}") in BetterDiscord plugin`);
        };
        const fn = new Function("module", "exports", "require", "BdApi", "globalThis", code);
        fn(module, module.exports, req, BdApi, globalThis);

        let exported: any = module.exports;
        if (exported && exported.__esModule && exported.default) exported = exported.default;

        let instance: BdPluginInstance;
        if (typeof exported === "function") {
            try { instance = new exported(); } catch { instance = exported(); }
        } else {
            instance = exported;
        }
        if (!instance || (typeof instance.start !== "function" && typeof instance.stop !== "function")) {
            logger.warn(`BetterDiscord plugin ${fileName} has no start/stop`);
            return;
        }

        const name = typeof instance.getName === "function" ? instance.getName() : fileName.replace(/\.plugin\.js$/i, "");
        instance.start?.();
        running.set(name, instance);
        logger.info(`Loaded BetterDiscord plugin: ${name}`);
    } catch (e) {
        logger.error(`Failed to load BD plugin ${fileName}`, e);
    }
}

export default definePlugin({
    name: "BetterDiscordSupport",
    description: "Loads BetterDiscord .plugin.js files from Documents/werathcord/BetterDiscord/plugins",
    async start() {
        try { dataCache = (await Native.readAllData()) ?? {}; } catch { dataCache = {}; }
        const files = await Native.listPluginFiles();
        for (const f of files) await loadBdPlugin(f);
        (globalThis as any).werathcordBd = { reload: async () => {
            const fs = await Native.listPluginFiles();
            for (const f of fs) await loadBdPlugin(f);
        } };
    },
    stop() {
        for (const [name, inst] of running) {
            try { inst.stop?.(); } catch {}
            try { BdApi.Patcher.unpatchAll(name); } catch {}
        }
        running.clear();
        for (const [, el] of injectedStyles) el.remove();
        injectedStyles.clear();
        delete (globalThis as any).werathcordBd;
    }
});
