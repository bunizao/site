import type { CvDocument } from '@bunizao/contracts';

// Fake but realistic CV used automatically when the site-api read is unreachable
// in dev (plain `bun dev`). Every field here is invented — the legal name,
// phone, and precise address are NOT the owner's real details. Real content
// lives only in `../site-api`. Never paste real PII into this file.
export const SAMPLE_CV: CvDocument = {
  updatedAt: '2026-07-09',
  identity: {
    displayName: { en: 'Bunizao', zh: 'Bunizao' },
    legalName: {
      value: { en: 'Lin Wenqing', zh: '林文清' },
      redacted: true,
    },
    headline: {
      en: 'Frontend engineer — edge-rendered products & design systems',
      zh: '前端工程师 — 边缘渲染产品与设计系统',
    },
    location: {
      // Public value is city-level; the precise variant is redacted.
      value: { en: 'Melbourne, Australia', zh: '澳大利亚 · 墨尔本' },
      redacted: false,
    },
    email: {
      value: { en: 'hello@buxx.me', zh: 'hello@buxx.me' },
      redacted: false,
    },
    phone: {
      value: { en: '+61 4xx xxx 129', zh: '+61 4xx xxx 129' },
      redacted: true,
    },
    links: [
      { label: { en: 'buxx.me', zh: 'buxx.me' }, url: 'https://buxx.me' },
      { label: { en: 'GitHub', zh: 'GitHub' }, url: 'https://github.com/bunizao' },
      { label: { en: '無人之境', zh: '無人之境' }, url: 'https://buxx.me/blog' },
    ],
  },
  summary: {
    en: 'I build fast, quiet interfaces on the edge — Astro and React on Cloudflare Workers, with a bias for restraint over decoration. Comfortable owning a feature end to end: data model, SSR, motion, and the caching that keeps it honest under load.',
    zh: '我在边缘构建快速而克制的界面 —— Cloudflare Workers 上的 Astro 与 React，偏好克制胜于装饰。习惯从头到尾负责一个功能：数据模型、SSR、动效，以及在高负载下保持诚实的缓存策略。',
  },
  work: [
    {
      company: { value: { en: 'Meridian Labs', zh: 'Meridian Labs' } },
      role: { en: 'Frontend Engineer', zh: '前端工程师' },
      location: { value: { en: 'Remote', zh: '远程' }, redacted: false },
      start: '2024-03',
      summary: {
        en: 'Own the marketing and docs surface — a multi-tenant Astro site on Workers serving 2M+ requests a month.',
        zh: '负责营销与文档界面 —— 部署在 Workers 上、月请求量超 200 万的多租户 Astro 站点。',
      },
      highlights: [
        {
          en: 'Cut median TTFB from 340ms to 90ms with a cross-isolate edge cache and cache-tag purges.',
          zh: '通过跨隔离环境的边缘缓存与缓存标签清除，将中位 TTFB 从 340ms 降至 90ms。',
        },
        {
          en: 'Shipped a token-driven design system adopted by four product teams.',
          zh: '交付了一套以设计令牌为核心的设计系统，被四个产品团队采用。',
        },
        {
          en: 'Introduced a Playwright visual-regression gate that caught 30+ layout breaks pre-merge.',
          zh: '引入 Playwright 视觉回归门禁，在合并前拦截了 30 多次布局破坏。',
        },
      ],
      tags: ['Astro', 'Cloudflare Workers', 'TypeScript', 'Design systems'],
    },
    {
      company: { value: { en: 'Northwind Studio', zh: 'Northwind Studio' } },
      role: { en: 'Web Developer', zh: 'Web 开发工程师' },
      location: { value: { en: 'Melbourne', zh: '墨尔本' }, redacted: false },
      start: '2022-06',
      end: '2024-02',
      summary: {
        en: 'Built bespoke sites and internal tools for creative-industry clients.',
        zh: '为创意行业客户构建定制站点与内部工具。',
      },
      highlights: [
        {
          en: 'Delivered 12 client sites on a shared React + Vite foundation, halving setup time.',
          zh: '基于共享的 React + Vite 基座交付 12 个客户站点，将搭建时间减半。',
        },
        {
          en: 'Automated image pipelines (responsive srcset, AVIF) that dropped page weight ~45%.',
          zh: '自动化图片流水线（响应式 srcset、AVIF），将页面体积降低约 45%。',
        },
      ],
      tags: ['React', 'Vite', 'Node'],
    },
  ],
  projects: [
    {
      name: { en: 'buxx.me', zh: 'buxx.me' },
      url: 'https://buxx.me',
      description: {
        en: 'Personal site + blog + mood feed on Cloudflare Workers. Edge-cached SSR, a Telegram-mirrored feed, and a self-designed type system.',
        zh: '部署于 Cloudflare Workers 的个人站点、博客与心情流。边缘缓存 SSR、镜像 Telegram 的动态流，以及自研的字体系统。',
      },
      tags: ['Astro', 'React', 'Workers'],
    },
    {
      name: { en: 'Telegram image proxy', zh: 'Telegram 图片代理' },
      url: 'https://github.com/bunizao',
      description: {
        en: 'A Worker that rewrites and caches Telegram media at the edge, with signed URLs and on-the-fly resizing.',
        zh: '一个在边缘重写并缓存 Telegram 媒体的 Worker，支持签名 URL 与即时缩放。',
      },
      tags: ['Workers', 'R2', 'Image'],
    },
  ],
  education: [
    {
      school: {
        value: { en: 'University of Melbourne', zh: '墨尔本大学' },
        redacted: false,
      },
      degree: { en: 'B.S. Computer Science', zh: '计算机科学学士' },
      start: '2018',
      end: '2022',
      note: {
        en: 'Human–computer interaction focus.',
        zh: '主修方向：人机交互。',
      },
    },
  ],
  skills: [
    {
      group: { en: 'Languages', zh: '语言' },
      items: ['TypeScript', 'JavaScript', 'HTML', 'CSS', 'SQL'],
    },
    {
      group: { en: 'Frameworks', zh: '框架' },
      items: ['Astro', 'React', 'Vite', 'TailwindCSS'],
    },
    {
      group: { en: 'Platform', zh: '平台' },
      items: ['Cloudflare Workers', 'D1', 'R2', 'KV', 'Playwright'],
    },
  ],
};
