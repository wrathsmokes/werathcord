import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { app, IpcMainInvokeEvent } from "electron";
import { join } from "path";

function getBdDir(): string {
    const dir = join(app.getPath("documents"), "werathcord", "BetterDiscord");
    try { mkdirSync(dir, { recursive: true }); } catch {}
    return dir;
}

export function getPluginDir(): string {
    const dir = join(getBdDir(), "plugins");
    try { mkdirSync(dir, { recursive: true }); } catch {}
    return dir;
}

export function listPluginFiles(_event: IpcMainInvokeEvent): string[] {
    try {
        return readdirSync(getPluginDir()).filter(f => f.endsWith(".plugin.js"));
    } catch {
        return [];
    }
}

export function readPluginFile(_event: IpcMainInvokeEvent, name: string): string | null {
    try {
        return readFileSync(join(getPluginDir(), name), "utf8");
    } catch {
        return null;
    }
}

export function readAllData(_event: IpcMainInvokeEvent): Record<string, Record<string, any>> {
    const out: Record<string, Record<string, any>> = {};
    try {
        const dir = join(getBdDir(), "data");
        if (!existsSync(dir)) return out;
        for (const f of readdirSync(dir)) {
            if (f.endsWith(".json")) {
                const key = f.replace(/\.json$/, "");
                try { out[key] = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch {}
            }
        }
    } catch {}
    return out;
}

export function saveData(_event: IpcMainInvokeEvent, pluginName: string, all: Record<string, any>): boolean {
    try {
        const dir = join(getBdDir(), "data");
        try { mkdirSync(dir, { recursive: true }); } catch {}
        writeFileSync(join(dir, `${pluginName}.json`), JSON.stringify(all, null, 2));
        return true;
    } catch {
        return false;
    }
}
