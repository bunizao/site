import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CollectionEntry } from 'astro:content';

export const REGISTRY_ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';

type RegistryFileType = 'registry:lib' | 'registry:ui';

interface RegistryFile {
  path: string;
  content: string;
  type: RegistryFileType;
  target?: string;
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
const repoRoot = path.resolve(process.cwd());

const primitiveConfig = {
  button: {
    dependencies: ['@radix-ui/react-slot', 'class-variance-authority'],
  },
  badge: {},
  card: {},
} as const;

async function readRegistryFile(relativePath: string, type: RegistryFileType): Promise<RegistryFile> {
  return {
    path: relativePath,
    content: await readFile(path.join(sourceRoot, relativePath), 'utf8'),
    type,
  };
}

async function readRepoRegistryFile(
  relativePath: string,
  outputPath: string,
  type: RegistryFileType,
  transform: (content: string) => string = (content) => content
): Promise<RegistryFile> {
  return {
    path: outputPath,
    content: transform(await readFile(path.join(repoRoot, relativePath), 'utf8')),
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

async function buildMoodWheelItem(): Promise<RegistryItem> {
  const sources = [
    {
      path: 'features/mood/client/timeline-wheel.ts',
      target: '@lib/timeline-wheel.ts',
      type: 'registry:lib' as const,
    },
    {
      path: 'features/mood/client/timeline-date-tracker.ts',
      target: '@lib/timeline-date-tracker.ts',
      type: 'registry:lib' as const,
    },
    {
      path: 'features/mood/shared/feed-anchor.ts',
      target: '@lib/feed-anchor.ts',
      type: 'registry:lib' as const,
    },
    {
      path: 'lib/page-scroll.ts',
      target: '@lib/page-scroll.ts',
      type: 'registry:lib' as const,
    },
    {
      path: 'features/mood/ui/TimelineWheel.astro',
      target: '@ui/timeline-wheel.astro',
      type: 'registry:ui' as const,
    },
  ];
  const files = await Promise.all(sources.map(async ({ path: filePath, target, type }) => ({
    ...await readRegistryFile(filePath, type),
    target,
  })));
  files[0].content = files[0].content
    .replace("@/features/mood/client/timeline-date-tracker", '@/lib/timeline-date-tracker')
    .replace("@/features/mood/shared/feed-anchor", '@/lib/feed-anchor');
  files[4].content = files[4].content.replace(
    "@/features/mood/client/timeline-wheel",
    '@/lib/timeline-wheel'
  );

  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'mood-wheel',
    type: 'registry:ui',
    dependencies: ['gsap', 'slot-text'],
    files,
    cssVars: {
      light: { 'wheel-size': '600px' },
      dark: { 'wheel-size': '600px' },
    },
  };
}

async function buildListeningItem(): Promise<RegistryItem> {
  const rewriteImports = (content: string) => content
    .replace("@/features/home/types", '@/lib/listening-types')
    .replace("@/assets/apple-logo.svg?raw", '@/lib/apple-logo.svg?raw')
    .replace("@/lib/listening/markup", '@/lib/listening-markup')
    .replace("@/lib/listening/controller", '@/lib/listening-controller')
    .replace("@/styles/listening.css", '@/lib/listening.css');
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'listening',
    type: 'registry:lib',
    files: [
      await readRepoRegistryFile(
        'src/features/home/ui/Listening.astro',
        'features/home/ui/Listening.astro',
        'registry:lib',
        rewriteImports
      ),
      await readRepoRegistryFile(
        'src/features/home/types.ts',
        'lib/listening-types.ts',
        'registry:lib'
      ),
      await readRepoRegistryFile(
        'src/lib/listening/markup.ts',
        'lib/listening-markup.ts',
        'registry:lib'
      ),
      await readRepoRegistryFile(
        'src/lib/listening/controller.ts',
        'lib/listening-controller.ts',
        'registry:lib'
      ),
      await readRepoRegistryFile(
        'src/styles/listening.css',
        'lib/listening.css',
        'registry:lib'
      ),
      await readRegistryFile('lib/musickit/player.ts', 'registry:lib'),
      await readRegistryFile('assets/apple-logo.svg', 'registry:lib'),
    ],
  };
}

async function buildDecodeTextItem(): Promise<RegistryItem> {
  const component = await readRepoRegistryFile(
    'src/features/components/previews/DecodeTextPreview.tsx',
    'components/decode-text.tsx',
    'registry:ui',
    (content) => content.replace(
      "from '@bunizao/decode-text'",
      "from '@/lib/decode-text-engine'"
    )
  );
  component.target = '@ui/decode-text.tsx';

  const engine = await readRepoRegistryFile(
    'packages/decode-text/src/index.ts',
    'lib/decode-text-engine.ts',
    'registry:lib'
  );
  engine.target = '@lib/decode-text-engine.ts';

  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'decode-text',
    type: 'registry:ui',
    files: [component, engine],
  };
}

async function buildProjectsDeckItem(): Promise<RegistryItem> {
  const paths = [
    ...(await listFiles('components/project-cards')),
    ...(await listFiles('components/icons')),
    'data/site.ts',
  ];
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: 'projects-deck',
    type: 'registry:ui',
    dependencies: ['framer-motion', 'lucide-react'],
    registryDependencies: ['utils'],
    files: await Promise.all(paths.map(async (filePath) => {
      const file = await readRegistryFile(filePath, 'registry:ui');
      return {
        ...file,
        content: file.content
          .replaceAll('@/components/project-cards/', '@/components/ui/')
          .replaceAll('@/components/icons', '@/components/ui')
          .replaceAll('@/data/site', '@/components/ui/site'),
      };
    })),
  };
}

async function buildPreviewItem(
  name: string,
  paths: string[],
  dependencies: string[] = []
): Promise<RegistryItem> {
  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name,
    type: 'registry:lib',
    ...(dependencies.length ? { dependencies } : {}),
    files: await Promise.all(paths.map((filePath) => readRegistryFile(filePath, 'registry:lib'))),
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

  if (entry.id === 'mood-wheel') return buildMoodWheelItem();
  if (entry.id === 'listening') return buildListeningItem();
  if (entry.id === 'decode-text') return buildDecodeTextItem();
  if (entry.id === 'projects-deck') return buildProjectsDeckItem();
  if (entry.id === 'contact-links') {
    const item = await buildPreviewItem(
      entry.id,
      ['features/components/previews/ContactLinksPreview.astro', 'components/icons/brand.tsx'],
      ['lucide-react']
    );
    item.files[0].content = item.files[0].content.replace(
      "from '@/components/icons/brand'",
      "from '@/lib/brand'"
    );
    return item;
  }
  if (entry.id === 'mobile-reading-bar') {
    const file = await readRegistryFile(
      'features/components/ui/MobileReadingBar.astro',
      'registry:ui'
    );
    file.target = '@ui/mobile-reading-bar.astro';
    return {
      $schema: REGISTRY_ITEM_SCHEMA,
      name: entry.id,
      type: 'registry:ui',
      files: [file],
    };
  }
  if (entry.id === 'tag-cards') {
    const item = await buildPreviewItem(entry.id, ['features/components/previews/TagsPreview.astro']);
    item.files[0].content = item.files[0].content.replaceAll("'/showcase/", "'https://buxx.me/showcase/");
    return item;
  }
  if (entry.id === 'github-activity') {
    return buildPreviewItem(entry.id, ['features/home/ui/GitHubContributions.astro']);
  }
  if (entry.id === 'update-pills') {
    return buildPreviewItem(entry.id, ['features/components/previews/MoodButtonPreview.astro']);
  }
  if (entry.id === 'list-hover') {
    const item = await buildPreviewItem(entry.id, [
      'features/components/previews/HoverListPreview.astro',
      'lib/hover-indicator.ts',
    ]);
    item.files[0].content = item.files[0].content.replaceAll("'/showcase/", "'https://buxx.me/showcase/");
    return item;
  }

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
