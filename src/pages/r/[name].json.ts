import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  buildRegistryItem,
  buildUtilsRegistryItem,
  type RegistryItem,
} from '@/features/components/server/registry';

export const prerender = true;

export async function getStaticPaths() {
  const entries = await getCollection(
    'components',
    ({ data }) => !data.draft && data.install.type === 'registry'
  );
  const items = await Promise.all(entries.map((entry) => buildRegistryItem(entry)));
  items.push(await buildUtilsRegistryItem());

  return items.map((item) => ({
    params: { name: item.name },
    props: { item },
  }));
}

export const GET: APIRoute<{ item: RegistryItem }> = ({ props }) => {
  return new Response(JSON.stringify(props.item, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
