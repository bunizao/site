import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CollectionEntry } from 'astro:content';

export const REGISTRY_ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';

type RegistryFileType = 'registry:lib' | 'registry:ui';

interface RegistryFile {
  path: string;
  content: string;
  type: RegistryFileType;
}

interface RegistryCssVars {
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

export interface RegistryItem {
  $schema: string;
  name: string;
  type: RegistryFileType;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
  cssVars?: RegistryCssVars;
}

const sourceRoot = path.resolve(process.cwd(), 'src');

const primitiveConfig = {
  button: {
    dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
  },
  badge: {},
  card: {},
} as const;

const mascotCssVars = {
  'peek-look-red': '#e85a4f',
  'peek-look-white': '#fafaf7',
  'peek-look-gold': '#f0c14b',
  'peek-look-green': '#6aa07c',
  'peek-look-ink': '#fafaf7',
  'peek-look-purple': '#9b80d8',
  'peek-look-brown': '#b48662',
};

async function readRegistryFile(relativePath: string, type: RegistryFileType): Promise<RegistryFile> {
  return {
    path: relativePath,
    content: await readFile(path.join(sourceRoot, relativePath), 'utf8'),
    type,
  };
}

async function listFiles(relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = path.join(sourceRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
  }));

  return files.flat().sort();
}

async function buildPrimitiveItem(name: keyof typeof primitiveConfig): Promise<RegistryItem> {
  const config = primitiveConfig[name];
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name,
    type: 'registry:ui',
    ...('dependencies' in config ? { dependencies: [...config.dependencies] } : {}),
    registryDependencies: ['utils'],
    files: [await readRegistryFile(`components/ui/${name}.tsx`, 'registry:ui')],
  };
}

async function buildMascotItem(): Promise<RegistryItem> {
  const paths = await listFiles('features/mascot/peek');
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'mascot',
    type: 'registry:lib',
    files: await Promise.all(paths.map((filePath) => readRegistryFile(filePath, 'registry:lib'))),
    cssVars: {
      light: mascotCssVars,
      dark: mascotCssVars,
    },
  };
}

async function buildMoodWheelItem(): Promise<RegistryItem> {
  const paths = [
    'features/mood/client/timeline-wheel.ts',
    'features/mood/client/timeline-date-tracker.ts',
  ];
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'mood-wheel',
    type: 'registry:lib',
    dependencies: ['gsap', 'slot-text'],
    files: await Promise.all(paths.map((filePath) => readRegistryFile(filePath, 'registry:lib'))),
    cssVars: {
      light: { 'wheel-size': '600px' },
      dark: { 'wheel-size': '600px' },
    },
  };
}

export async function buildRegistryItem(
  entry: CollectionEntry<'components'>
): Promise<RegistryItem> {
  if (entry.data.install.type !== 'registry') {
    throw new Error(`Component ${entry.id} is not a registry item`);
  }

  if (entry.id in primitiveConfig) {
    return buildPrimitiveItem(entry.id as keyof typeof primitiveConfig);
  }

  if (entry.id === 'mascot') return buildMascotItem();
  if (entry.id === 'mood-wheel') return buildMoodWheelItem();

  throw new Error(`Missing registry configuration for ${entry.id}`);
}

export async function buildUtilsRegistryItem(): Promise<RegistryItem> {
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'utils',
    type: 'registry:lib',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [await readRegistryFile('lib/utils.ts', 'registry:lib')],
  };
}
