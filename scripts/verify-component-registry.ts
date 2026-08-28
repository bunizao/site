import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const SHADCN_VERSION = '4.13.0';
const PUBLIC_REGISTRY_SLUGS = [
  'badge',
  'button',
  'card',
  'contact-links',
  'conversation',
  'decode-text',
  'github-activity',
  'list-hover',
  'listening',
  'mobile-reading-bar',
  'mood-wheel',
  'projects-deck',
  'tag-cards',
  'update-pills',
] as const;
const SERVED_REGISTRY_SLUGS = new Set<string>([
  ...PUBLIC_REGISTRY_SLUGS,
  'utils',
]);

const registryRoot = resolve(process.cwd(), 'dist/client/r');
let server: ReturnType<typeof Bun.serve> | undefined;
let tempRoot: string | undefined;
let cleanupPromise: Promise<void> | undefined;

function jsonError(status: number, error: string): Response {
  return Response.json(
    { error },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function decodedRequestPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const rawPath = requestUrl.slice(url.origin.length).split(/[?#]/, 1)[0] || '/';

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  const segments = decodedPath.split('/');
  if (
    decodedPath.includes('\0')
    || decodedPath.includes('\\')
    || segments.includes('.')
    || segments.includes('..')
  ) {
    return null;
  }

  return decodedPath;
}

async function serveRegistry(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        Allow: 'GET, HEAD',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  const requestPath = decodedRequestPath(request.url);
  if (!requestPath) return jsonError(400, 'Invalid registry path');

  const match = requestPath.match(/^\/r\/([a-z0-9-]+)(?:\.json)?$/);
  if (!match) return jsonError(404, 'Registry item not found');

  const slug = match[1];
  if (!SERVED_REGISTRY_SLUGS.has(slug)) {
    return jsonError(404, 'Registry item not found');
  }

  const artifactPath = resolve(registryRoot, slug);
  const artifactRelativePath = relative(registryRoot, artifactPath);
  if (
    artifactRelativePath === '..'
    || artifactRelativePath.startsWith(`..${sep}`)
    || isAbsolute(artifactRelativePath)
  ) {
    return jsonError(400, 'Invalid registry path');
  }

  const artifact = Bun.file(artifactPath);
  if (!await artifact.exists()) return jsonError(404, 'Registry item not found');

  return new Response(request.method === 'HEAD' ? null : artifact, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  if (exitCode === 0) return;

  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  throw new Error(
    `Command failed (${exitCode}): ${command.join(' ')}${output ? `\n${output}` : ''}`,
  );
}

async function assertBuiltRegistry(): Promise<void> {
  try {
    await Promise.all(
      [...PUBLIC_REGISTRY_SLUGS, 'utils'].map((slug) => access(join(registryRoot, slug))),
    );
  } catch {
    throw new Error('Component registry build is missing. Run `bun run build` first.');
  }
}

async function installConversationUsage(consumerRoot: string): Promise<void> {
  const entry = await readFile(
    resolve(process.cwd(), 'src/content/components/conversation.md'),
    'utf8',
  );
  const usage = entry.match(/```astro\n([\s\S]*?)\n```/u)?.[1];
  if (!usage) throw new Error('Conversation usage example is missing its Astro fence.');

  await Bun.write(join(consumerRoot, 'src/pages/conversation.astro'), usage);
}

function cleanup(): Promise<void> {
  cleanupPromise ??= (async () => {
    server?.stop(true);
    server = undefined;

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  })();

  return cleanupPromise;
}

async function main(): Promise<void> {
  await assertBuiltRegistry();
  tempRoot = await mkdtemp(join(tmpdir(), 'component-registry-'));
  const stopOnSignal = (exitCode: number) => {
    void cleanup().finally(() => process.exit(exitCode));
  };
  const onInterrupt = () => stopOnSignal(130);
  const onTerminate = () => stopOnSignal(143);

  try {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: serveRegistry,
    });
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);

    const consumerRoot = join(tempRoot, 'registry-consumer');
    const registryUrls = PUBLIC_REGISTRY_SLUGS.map(
      (slug) => new URL(`/r/${slug}`, server!.url).href,
    );

    console.log(`[registry] Serving ${PUBLIC_REGISTRY_SLUGS.length} items at ${server.url.origin}`);
    console.log('[registry] Creating blank Astro consumer');
    await run([
      'bunx',
      `shadcn@${SHADCN_VERSION}`,
      'create',
      '--template',
      'astro',
      '--base',
      'radix',
      '--preset',
      'nova',
      '--name',
      'registry-consumer',
      '--cwd',
      tempRoot,
      '--yes',
    ], tempRoot);

    console.log(`[registry] Installing ${PUBLIC_REGISTRY_SLUGS.length} items`);
    await run([
      'bunx',
      `shadcn@${SHADCN_VERSION}`,
      'add',
      ...registryUrls,
      '--cwd',
      consumerRoot,
      '--yes',
      '--overwrite',
    ], consumerRoot);

    console.log('[registry] Pasting the conversation usage example');
    await installConversationUsage(consumerRoot);
    console.log('[registry] Typechecking consumer');
    await run(['bun', 'run', 'typecheck'], consumerRoot);
    console.log('[registry] Building consumer');
    await run(['bun', 'run', 'build'], consumerRoot);
    console.log(`[registry] Verified ${PUBLIC_REGISTRY_SLUGS.length} registry items`);
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    await cleanup();
  }
}

await main();
