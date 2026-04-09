/**
 * Filesystem-based storage using Capacitor Filesystem plugin.
 * Saves data as JSON files in "المسابقات الرمضانية" folder on the device.
 * Falls back to IndexedDB when running in browser (non-native).
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const FOLDER = 'المسابقات الرمضانية';

const isNative = () => Capacitor.isNativePlatform();

const ensureFolder = async () => {
  if (!isNative()) return;
  try {
    await Filesystem.mkdir({
      path: FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    // folder already exists
  }
};

export const writeJsonFile = async (filename: string, data: any): Promise<void> => {
  if (!isNative()) {
    // Fallback: use localStorage for web
    localStorage.setItem(`musabaqat_${filename}`, JSON.stringify(data));
    return;
  }

  await ensureFolder();
  await Filesystem.writeFile({
    path: `${FOLDER}/${filename}.json`,
    data: JSON.stringify(data, null, 2),
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
};

export const readJsonFile = async <T>(filename: string): Promise<T | null> => {
  if (!isNative()) {
    const raw = localStorage.getItem(`musabaqat_${filename}`);
    return raw ? JSON.parse(raw) : null;
  }

  try {
    const result = await Filesystem.readFile({
      path: `${FOLDER}/${filename}.json`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(result.data as string);
  } catch {
    return null;
  }
};

export const deleteJsonFile = async (filename: string): Promise<void> => {
  if (!isNative()) {
    localStorage.removeItem(`musabaqat_${filename}`);
    return;
  }

  try {
    await Filesystem.deleteFile({
      path: `${FOLDER}/${filename}.json`,
      directory: Directory.Documents,
    });
  } catch {
    // file doesn't exist
  }
};

export const listFiles = async (): Promise<string[]> => {
  if (!isNative()) {
    return Object.keys(localStorage)
      .filter(k => k.startsWith('musabaqat_'))
      .map(k => k.replace('musabaqat_', ''));
  }

  try {
    await ensureFolder();
    const result = await Filesystem.readdir({
      path: FOLDER,
      directory: Directory.Documents,
    });
    return result.files
      .filter(f => f.name.endsWith('.json'))
      .map(f => f.name.replace('.json', ''));
  } catch {
    return [];
  }
};
