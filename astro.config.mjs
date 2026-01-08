import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import { presetAttributify, presetUno } from 'unocss';
import presetIcons from '@unocss/preset-icons';
import { presetTypography } from '@unocss/preset-typography';

export default defineConfig({
  integrations: [
    UnoCSS({
      presets: [
        presetIcons(),
        presetAttributify(),
        presetUno({
          dark: 'media'
        }),
        presetTypography({
          cssExtend: {
            'a': {
              'text-decoration': 'none',
            },
          },
        }),
      ],
      injectReset: true,
    }),
  ],
  output: 'static',
});
